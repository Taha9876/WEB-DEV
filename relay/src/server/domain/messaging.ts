import { and, eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "../db";
import type { Ctx } from "../context";
import { conflict, forbidden, notFound } from "../errors";
import { publish } from "../realtime";
import { addActivity } from "./activity";
import { createLead, touchLeadsForContact } from "./leads";
import { normalizePhone } from "@/lib/phone";
import { registerJob, PermanentError } from "../worker/jobs";
import { ProviderError, sendWhatsApp } from "../integrations/twilio";
import { logEvent } from "../integrations/store";

const { contacts, conversations, messages, jobs } = schema;
const STATUS_RANK: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4, undelivered: 5, failed: 5 };
const OPT_OUT = /^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i;
const OPT_IN = /^\s*(start|unstop)\s*$/i;

async function conversationFor(tx: Tx, workspaceId: string, contactId: string, channel = "whatsapp") {
  await tx.insert(conversations).values({ workspaceId, contactId, channel }).onConflictDoNothing();
  const [c] = await tx.select().from(conversations).where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.contactId, contactId), eq(conversations.channel, channel)));
  return c;
}

/**
 * Inbound WhatsApp message (I1.1, I1.5, I1.8). Known number → attaches to the contact;
 * unknown → new contact + lead. Redelivered webhooks hit the unique (workspace, MessageSid) index and are ignored.
 */
export async function receiveMessage(workspaceId: string, p: { sid: string; from: string; body: string; profileName?: string }) {
  const phone = normalizePhone(p.from);
  if (!phone) throw new Error(`Unrecognised sender ${p.from}`);
  const res = await db.transaction(async (tx) => {
    const [dupe] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.providerSid, p.sid)));
    if (dupe) return { duplicate: true as const };
    let [contact] = await tx.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.phone, phone)));
    let isNew = false;
    if (!contact) {
      const [first, ...rest] = (p.profileName?.trim() || phone).split(/\s+/);
      [contact] = await tx.insert(contacts).values({ workspaceId, firstName: first, lastName: rest.join(" ") || null, phone, tags: ["whatsapp"] }).returning();
      isNew = true;
    }
    const conv = await conversationFor(tx, workspaceId, contact.id);
    const inserted = await tx.insert(messages).values({ workspaceId, conversationId: conv.id, direction: "inbound", body: p.body.slice(0, 4000), providerSid: p.sid, status: "received" })
      .onConflictDoNothing().returning();
    if (!inserted.length) return { duplicate: true as const };
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    await addActivity({ workspaceId, contactId: contact.id, type: "message", summary: `WhatsApp: “${p.body.slice(0, 140)}”`, data: { messageId: inserted[0].id, direction: "inbound" } }, tx);
    if (OPT_OUT.test(p.body) && !contact.optedOut) {
      await tx.update(contacts).set({ optedOut: true, optedOutAt: new Date() }).where(eq(contacts.id, contact.id));
      await addActivity({ workspaceId, contactId: contact.id, type: "field_edit", summary: "Opted out of messages (sent STOP)" }, tx);
    } else if (OPT_IN.test(p.body) && contact.optedOut) {
      await tx.update(contacts).set({ optedOut: false, optedOutAt: null }).where(eq(contacts.id, contact.id));
    }
    const lead = isNew ? await createLead({ workspaceId, contactId: contact.id, source: "whatsapp", message: p.body.slice(0, 2000) }, tx) : null;
    return { duplicate: false as const, contactId: contact.id, conversationId: conv.id, messageId: inserted[0].id, leadId: lead?.id ?? null, isNew };
  });
  if (!res.duplicate) await publish(workspaceId, { type: "message.new", conversationId: res.conversationId, messageId: res.messageId });
  return res;
}

/** Delivery receipts. Status only moves forward, so out-of-order callbacks can't regress it (I1.4). */
export async function updateStatus(workspaceId: string, sid: string, status: string, errorCode?: string, errorMessage?: string) {
  const [m] = await db.select().from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.providerSid, sid)));
  if (!m) return false;
  const next = status as (typeof schema.msgStatusEnum.enumValues)[number];
  if (!(next in STATUS_RANK) || STATUS_RANK[next] < (STATUS_RANK[m.status] ?? 0)) return true;
  await db.update(messages).set({ status: next, errorCode: errorCode ?? m.errorCode, errorMessage: errorMessage ?? m.errorMessage, updatedAt: new Date() }).where(eq(messages.id, m.id));
  await publish(workspaceId, { type: "message.status", conversationId: m.conversationId, messageId: m.id });
  return true;
}

async function visibleContact(ctx: Ctx, contactId: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)));
  if (!c || (!ctx.can("crm.view_all") && c.ownerId !== ctx.userId)) throw notFound("Contact");
  return c;
}

/** I1.3 / I1.7 / I1.9 — queue an outbound message; the worker sends and retries. Nothing is silently dropped. */
export async function sendMessage(ctx: Ctx, contactId: string, body: string, meta: { ai?: boolean } = {}) {
  ctx.require("crm.edit", "message customers");
  const c = await visibleContact(ctx, contactId);
  if (c.optedOut) throw forbidden("message this contact — they opted out (sent STOP). They must message you first to opt back in");
  if (!c.phone) throw conflict("This contact has no phone number. Add one to start a WhatsApp conversation.");
  const out = await db.transaction(async (tx) => {
    const conv = await conversationFor(tx, ctx.workspaceId, c.id);
    const [m] = await tx.insert(messages).values({ workspaceId: ctx.workspaceId, conversationId: conv.id, direction: "outbound", body, status: "queued", senderId: ctx.userId }).returning();
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    await tx.insert(jobs).values({ workspaceId: ctx.workspaceId, kind: "send_message", payload: { messageId: m.id }, maxAttempts: 4 });
    await addActivity({ workspaceId: ctx.workspaceId, contactId: c.id, actorId: ctx.userId, type: "message", summary: `${meta.ai ? "AI-drafted reply" : "Replied"}: “${body.slice(0, 140)}”`, data: { messageId: m.id, direction: "outbound" } }, tx);
    await touchLeadsForContact(tx, ctx.workspaceId, c.id, ctx.userId, "WhatsApp reply");
    return { message: m, conversationId: conv.id };
  });
  await publish(ctx.workspaceId, { type: "message.new", conversationId: out.conversationId, messageId: out.message.id });
  return out.message;
}

/** Automated outbound (no human sender). Same queue, retries and opt-out rules as a human reply. */
export async function queueSystemMessage(workspaceId: string, contactId: string, body: string, label: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)));
  if (!c || c.optedOut || !c.phone) return null;
  const out = await db.transaction(async (tx) => {
    const conv = await conversationFor(tx, workspaceId, c.id);
    const [m] = await tx.insert(messages).values({ workspaceId, conversationId: conv.id, direction: "outbound", body, status: "queued" }).returning();
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    await tx.insert(jobs).values({ workspaceId, kind: "send_message", payload: { messageId: m.id }, maxAttempts: 4 });
    await addActivity({ workspaceId, contactId: c.id, type: "ai", summary: `${label}: “${body.slice(0, 140)}”`, data: { messageId: m.id, direction: "outbound" } }, tx);
    return { m, conv };
  });
  await publish(workspaceId, { type: "message.new", conversationId: out.conv.id, messageId: out.m.id });
  return out.m;
}

export async function retryMessage(ctx: Ctx, messageId: string) {
  ctx.require("crm.edit", "message customers");
  const [m] = await db.select({ m: messages, contactId: conversations.contactId }).from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, messageId), eq(messages.workspaceId, ctx.workspaceId)));
  if (!m) throw notFound("Message");
  const c = await visibleContact(ctx, m.contactId);
  if (c.optedOut) throw forbidden("message this contact — they opted out");
  if (m.m.status !== "failed" && m.m.status !== "undelivered") throw conflict("Only failed messages can be retried.");
  await db.transaction(async (tx) => {
    await tx.update(messages).set({ status: "queued", errorCode: null, errorMessage: null, updatedAt: new Date() }).where(eq(messages.id, messageId));
    await tx.insert(jobs).values({ workspaceId: ctx.workspaceId, kind: "send_message", payload: { messageId }, maxAttempts: 4 });
  });
  await publish(ctx.workspaceId, { type: "message.status", conversationId: m.m.conversationId, messageId });
}

/** Worker: actually send via Twilio. Transient → retry with back-off; permanent or final → visible failure with reason. */
registerJob("send_message", async (payload, workspaceId, meta) => {
  const id = String(payload.messageId);
  const [row] = await db.select({ m: messages, phone: contacts.phone, optedOut: contacts.optedOut }).from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId)).innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(messages.id, id));
  if (!row || row.m.status !== "queued" && row.m.status !== "sending") return;
  const fail = async (msg: string, code?: string | number) => {
    await db.update(messages).set({ status: "failed", errorMessage: msg, errorCode: code ? String(code) : null, attempts: meta.attempt, updatedAt: new Date() }).where(eq(messages.id, id));
    await publish(row.m.workspaceId, { type: "message.status", conversationId: row.m.conversationId, messageId: id });
  };
  if (row.optedOut) return fail("Not sent: the contact opted out.");
  if (!row.phone) return fail("Not sent: the contact has no phone number.");
  await db.update(messages).set({ status: "sending", attempts: meta.attempt, updatedAt: new Date() }).where(eq(messages.id, id));
  try {
    const r = await sendWhatsApp(workspaceId!, row.phone, row.m.body, id);
    await db.update(messages).set({ providerSid: r.sid, status: r.status === "queued" || r.status === "accepted" ? "sent" : (r.status as never), updatedAt: new Date() }).where(eq(messages.id, id));
    await publish(row.m.workspaceId, { type: "message.status", conversationId: row.m.conversationId, messageId: id });
  } catch (e) {
    const pe = e as ProviderError;
    if (pe.transient && !meta.final) {
      await db.update(messages).set({ status: "queued", errorMessage: `Retrying: ${pe.message}`, updatedAt: new Date() }).where(eq(messages.id, id));
      await publish(row.m.workspaceId, { type: "message.status", conversationId: row.m.conversationId, messageId: id });
      throw e;
    }
    await fail(pe.message, pe.code);
    throw new PermanentError(pe.message);
  }
});

export async function inbox(ctx: Ctx) {
  ctx.require("crm.view", "view conversations");
  return db.execute<{ id: string; contact_id: string; name: string; phone: string | null; last_message_at: Date | null; last_body: string | null; last_dir: string | null; owner_name: string | null; unread: number }>(sql`
    select cv.id, c.id as contact_id, trim(c.first_name || ' ' || coalesce(c.last_name, '')) as name, c.phone, cv.last_message_at, u.name as owner_name,
      (select body from messages m where m.conversation_id = cv.id order by created_at desc limit 1) as last_body,
      (select direction from messages m where m.conversation_id = cv.id order by created_at desc limit 1) as last_dir,
      0 as unread
    from conversations cv join contacts c on c.id = cv.contact_id left join users u on u.id = c.owner_id
    where cv.workspace_id = ${ctx.workspaceId} ${ctx.can("crm.view_all") ? sql`` : sql`and c.owner_id = ${ctx.userId}`}
    order by cv.last_message_at desc nulls last limit 200`);
}

export { logEvent };

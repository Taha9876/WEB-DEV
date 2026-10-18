import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Ctx } from "../context";
import { notFound } from "../errors";
import { registerJob, PermanentError } from "../worker/jobs";
import { AiUnavailable, aiEnabled, briefing, draftReply, firstResponse, nlToFilters, triageLead } from "../ai";
import { fieldsFor, validateCustom } from "./fields";
import { addActivity } from "./activity";
import { queueSystemMessage } from "./messaging";
import { listPipelines } from "./fields";
import { publish } from "../realtime";

const { leads, contacts, workspaces, users, messages, conversations, opportunities, stages, payments, appointments } = schema;

/** Job: score + summarise a new lead and fill empty custom fields from what the customer said. */
registerJob("ai_triage", async (payload) => {
  if (!aiEnabled()) return;
  const [row] = await db.select({ lead: leads, contact: contacts, company: workspaces.name }).from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId)).innerJoin(workspaces, eq(workspaces.id, leads.workspaceId))
    .where(eq(leads.id, String(payload.leadId)));
  if (!row?.lead.message || row.lead.ai) return;
  const defs = await fieldsFor(row.lead.workspaceId, "contact");
  let t;
  try {
    t = await triageLead({ company: row.company, message: row.lead.message, source: row.lead.source, fields: defs.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.options })) });
  } catch (e) {
    if (e instanceof AiUnavailable) throw new PermanentError(e.message);
    throw e;
  }
  // Only fill fields the customer stated and that are still empty; invalid values are dropped, not forced.
  const fill: Record<string, unknown> = {};
  for (const f of t.fields) {
    const d = defs.find((x) => x.key === f.key);
    if (!d || row.contact.custom[f.key] !== undefined) continue;
    try { Object.assign(fill, validateCustom([d], { [f.key]: f.value })); } catch { /* skip */ }
  }
  const tags = [...new Set([...row.contact.tags, ...t.tags.map((x) => x.toLowerCase().slice(0, 30)), ...(t.urgency >= 75 ? ["hot"] : [])])].slice(0, 20);
  await db.transaction(async (tx) => {
    await tx.update(leads).set({ ai: { intent: t.intent, urgency: t.urgency, language: t.language, summary: t.summary, tags: t.tags } }).where(eq(leads.id, row.lead.id));
    await tx.update(contacts).set({ custom: { ...row.contact.custom, ...fill }, tags, version: sql`${contacts.version} + 1` }).where(eq(contacts.id, row.contact.id));
    await addActivity({ workspaceId: row.lead.workspaceId, contactId: row.contact.id, leadId: row.lead.id, type: "ai",
      summary: `AI triage — ${t.intent} · urgency ${t.urgency}/100 · ${t.summary}${Object.keys(fill).length ? ` · filled ${Object.keys(fill).join(", ")}` : ""}`, data: { urgency: t.urgency, filled: fill } }, tx);
  });
  await publish(row.lead.workspaceId, { type: "lead.assigned", leadId: row.lead.id, ownerId: row.lead.ownerId });
});

/** Job: the customer has waited a full window — send an honest automated acknowledgement once. */
registerJob("ai_first_response", async (payload) => {
  if (!aiEnabled()) return;
  const [row] = await db.select({ lead: leads, contact: contacts, company: workspaces.name, owner: users.name }).from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId)).innerJoin(workspaces, eq(workspaces.id, leads.workspaceId)).leftJoin(users, eq(users.id, leads.ownerId))
    .where(eq(leads.id, String(payload.leadId)));
  if (!row || row.lead.status !== "assigned" || row.contact.optedOut || !row.contact.phone) return;
  // Skip if anyone has already written to the customer.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(conversations.contactId, row.contact.id), eq(messages.direction, "outbound")));
  if (n > 0) return;
  let body: string;
  try {
    body = await firstResponse({ company: row.company, customer: row.contact.firstName, message: row.lead.message ?? "", ownerFirstName: row.owner?.split(" ")[0] ?? null });
  } catch (e) {
    if (e instanceof AiUnavailable) throw new PermanentError(e.message);
    throw e;
  }
  await queueSystemMessage(row.lead.workspaceId, row.contact.id, body, "AI first response (automated)");
});

async function visibleContact(ctx: Ctx, id: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
  if (!c || (!ctx.can("crm.view_all") && c.ownerId !== ctx.userId)) throw notFound("Contact");
  return c;
}

/** Reply copilot: drafts from the whole record — stage, payments, appointments, conversation. Never sends by itself. */
export async function draftReplyFor(ctx: Ctx, contactId: string) {
  ctx.require("crm.edit", "message customers");
  const c = await visibleContact(ctx, contactId);
  const [opps, pays, appts, msgs] = await Promise.all([
    db.select({ title: opportunities.title, stage: stages.name, value: opportunities.valueCents, currency: opportunities.currency })
      .from(opportunities).innerJoin(stages, eq(stages.id, opportunities.stageId)).where(eq(opportunities.contactId, c.id)),
    db.select({ status: payments.status, amount: payments.amountCents, currency: payments.currency, url: payments.url }).from(payments).where(eq(payments.contactId, c.id)).orderBy(desc(payments.createdAt)).limit(3),
    db.select({ title: appointments.title, startsAt: appointments.startsAt, tz: appointments.timezone, status: appointments.status }).from(appointments).where(eq(appointments.contactId, c.id)).orderBy(desc(appointments.startsAt)).limit(3),
    db.select({ direction: messages.direction, body: messages.body }).from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.contactId, c.id)).orderBy(desc(messages.createdAt)).limit(20),
  ]);
  const showValue = ctx.can("crm.view_value");
  const record = [
    c.tags.length && `Tags: ${c.tags.join(", ")}`,
    ...opps.map((o) => `Opportunity: ${o.title} — stage ${o.stage}${showValue ? `, ${(o.value / 100).toFixed(0)} ${o.currency}` : ""}`),
    ...pays.map((p) => `Payment request: ${p.status}${showValue ? ` ${(p.amount / 100).toFixed(2)} ${p.currency}` : ""}${p.status === "pending" && p.url ? ` (link: ${p.url})` : ""}`),
    ...appts.map((a) => `Appointment: ${a.title} on ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: a.tz }).format(a.startsAt)} (${a.status})`),
  ].filter(Boolean).join("\n") || "(no records yet)";
  const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
  return draftReply({
    company: ws.name, agent: ctx.user.name.split(" ")[0], customer: `${c.firstName} ${c.lastName ?? ""}`.trim(), record,
    history: msgs.reverse().map((m) => ({ from: m.direction === "inbound" ? "customer" as const : "us" as const, text: m.body })),
  });
}

/** "Hot solar leads in Lahore this week owned by Bilal" → filter spec for the contacts list. */
export async function filtersFromText(ctx: Ctx, query: string) {
  ctx.require("crm.view", "search contacts");
  const [defs, pipes, team, tagRows] = await Promise.all([
    fieldsFor(ctx.workspaceId, "contact"), listPipelines(ctx.workspaceId),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.workspaceId, ctx.workspaceId)).orderBy(asc(users.name)),
    db.selectDistinct({ t: sql<string>`unnest(${contacts.tags})` }).from(contacts).where(eq(contacts.workspaceId, ctx.workspaceId)).limit(100),
  ]);
  const catalog = [
    { field: "q", label: "Free-text search over name, email, phone" },
    { field: "owner", label: "Assigned employee", values: [{ id: "me", name: `me (${ctx.user.name})` }, { id: "none", name: "unassigned" }, ...team] },
    { field: "tag", label: "Tag", values: tagRows.map((r) => ({ id: r.t, name: r.t })) },
    { field: "stage", label: "Has an opportunity in stage", values: pipes.flatMap((p) => p.stages.map((s) => ({ id: s.id, name: `${p.name}: ${s.name}` }))) },
    { field: "source", label: "Lead source", values: [{ id: "web_form", name: "web form" }, { id: "whatsapp", name: "WhatsApp" }, { id: "manual", name: "manual entry" }] },
    { field: "created_after", label: "Created on or after date" }, { field: "created_before", label: "Created on or before date" },
    ...defs.map((d) => ({ field: `custom:${d.key}`, label: `${d.label} (${d.type})`, values: d.type === "dropdown" ? d.options.map((o) => ({ id: o, name: o })) : d.type === "checkbox" ? [{ id: "true", name: "yes" }, { id: "false", name: "no" }] : undefined })),
  ];
  const r = await nlToFilters(query, catalog, new Date().toISOString().slice(0, 10));
  const allowed = new Set(catalog.map((c) => c.field));
  return { filters: r.filters.filter((f) => allowed.has(f.field)), explanation: r.explanation };
}

/** Dashboard briefing from live numbers — every claim traces to the facts passed in. */
export async function managerBriefing(ctx: Ctx, facts: string) {
  ctx.require("leads.manage", "see the team briefing");
  return briefing(facts);
}


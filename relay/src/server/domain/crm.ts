import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import { audit } from "../audit";
import type { Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { addActivity } from "./activity";
import { fieldsFor, missingForStage, validateCustom } from "./fields";
import { touchLeadsForContact } from "./leads";

const { contacts, companies, opportunities, stages, users, activities, leads, payments, appointments, conversations, messages, pipelines } = schema;

/* ------------------------------------------------------------------ filters (F2.6) */
export type Filter = { field: string; value: string };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: string) => !isNaN(new Date(v).getTime());
/** Drops filter values that can't be valid for their field, so bad input never reaches SQL as an error. */
const sane = (f: Filter) => {
  const v = f.value?.trim();
  if (!v) return false;
  if (["company", "stage"].includes(f.field) || (f.field === "owner" && !["me", "none"].includes(v))) return isUuid(v);
  if (f.field.startsWith("created_")) return isDate(v);
  return true;
};
const STALE = "This record was changed by someone else in the meantime. Reload to see their changes, then try again.";

/** Saved lists store the filter spec, not results — so they re-evaluate on every read and stay current. */
function contactConds(ctx: Ctx, filters: Filter[]) {
  const c: (SQL | undefined)[] = [eq(contacts.workspaceId, ctx.workspaceId)];
  if (!ctx.can("crm.view_all")) c.push(eq(contacts.ownerId, ctx.userId));
  for (const f of filters.filter(sane)) {
    const v = f.value.trim();
    if (f.field === "q") c.push(or(ilike(sql`${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '')`, `%${v}%`), ilike(contacts.email, `%${v}%`), ilike(contacts.phone, `%${v}%`)));
    else if (f.field === "owner") c.push(v === "none" ? sql`${contacts.ownerId} is null` : eq(contacts.ownerId, v === "me" ? ctx.userId : v));
    else if (f.field === "tag") c.push(sql`${v} = any(${contacts.tags})`);
    else if (f.field === "company") c.push(eq(contacts.companyId, v));
    else if (f.field === "stage") c.push(sql`exists (select 1 from opportunities o where o.contact_id = ${contacts.id} and o.stage_id = ${v})`);
    else if (f.field === "source") c.push(sql`exists (select 1 from leads l where l.contact_id = ${contacts.id} and l.source = ${v})`);
    else if (f.field === "created_after") c.push(gte(contacts.createdAt, new Date(v)));
    else if (f.field === "created_before") c.push(lte(contacts.createdAt, new Date(new Date(v).getTime() + 86_400_000)));
    else if (f.field.startsWith("custom:")) c.push(sql`${contacts.custom} ->> ${f.field.slice(7)} = ${v}`);
  }
  return and(...c);
}

export async function listContacts(ctx: Ctx, filters: Filter[], page = 1, pageSize = 50) {
  ctx.require("crm.view", "view contacts");
  const rows = await db.select({
    id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone,
    tags: contacts.tags, custom: contacts.custom, optedOut: contacts.optedOut, createdAt: contacts.createdAt,
    companyName: companies.name, ownerName: users.name, ownerId: contacts.ownerId,
    openOpps: sql<number>`(select count(*)::int from opportunities o join stages s on s.id = o.stage_id where o.contact_id = ${contacts.id} and s.kind = 'open')`,
    total: sql<number>`count(*) over()`.mapWith(Number),
  }).from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(users, eq(users.id, contacts.ownerId))
    .where(contactConds(ctx, filters))
    .orderBy(desc(contacts.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total: rows[0]?.total ?? 0 };
}

/* ------------------------------------------------------------------ value masking (F1.4) */
export const maskValue = <T extends { valueCents: number | null }>(ctx: Ctx, o: T): T & { valueMasked: boolean } =>
  ctx.can("crm.view_value") ? { ...o, valueMasked: false } : { ...o, valueCents: null, valueMasked: true };

/* ------------------------------------------------------------------ contacts */
export async function getContactView(ctx: Ctx, id: string) {
  ctx.require("crm.view", "view contacts");
  const [row] = await db.select({ contact: contacts, company: companies, owner: { id: users.id, name: users.name, status: users.status } })
    .from(contacts).leftJoin(companies, eq(companies.id, contacts.companyId)).leftJoin(users, eq(users.id, contacts.ownerId))
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
  if (!row || (!ctx.can("crm.view_all") && row.contact.ownerId !== ctx.userId)) throw notFound("Contact");

  const actor = alias(users, "actor");
  const requester = alias(users, "requester");
  const [opps, acts, pays, appts, convs, leadRows, fields] = await Promise.all([
    db.select({ id: opportunities.id, title: opportunities.title, valueCents: opportunities.valueCents, currency: opportunities.currency,
      stageName: stages.name, stageKind: stages.kind, pipelineName: pipelines.name, ownerName: users.name, createdAt: opportunities.createdAt })
      .from(opportunities).innerJoin(stages, eq(stages.id, opportunities.stageId)).innerJoin(pipelines, eq(pipelines.id, opportunities.pipelineId))
      .leftJoin(users, eq(users.id, opportunities.ownerId)).where(eq(opportunities.contactId, id)).orderBy(desc(opportunities.createdAt)),
    db.select({ id: activities.id, type: activities.type, summary: activities.summary, data: activities.data, createdAt: activities.createdAt, actorName: actor.name })
      .from(activities).leftJoin(actor, eq(actor.id, activities.actorId)).where(eq(activities.contactId, id)).orderBy(desc(activities.createdAt)).limit(200),
    db.select({ id: payments.id, amountCents: payments.amountCents, currency: payments.currency, status: payments.status, refundedCents: payments.refundedCents,
      url: payments.url, paidAt: payments.paidAt, createdAt: payments.createdAt, opportunityId: payments.opportunityId, requestedBy: requester.name, reference: payments.paymentIntentId, sessionId: payments.checkoutSessionId })
      .from(payments).leftJoin(requester, eq(requester.id, payments.requestedBy)).where(eq(payments.contactId, id)).orderBy(desc(payments.createdAt)),
    db.select({ id: appointments.id, title: appointments.title, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone,
      status: appointments.status, userName: users.name, googleEventId: appointments.googleEventId })
      .from(appointments).leftJoin(users, eq(users.id, appointments.userId)).where(eq(appointments.contactId, id)).orderBy(desc(appointments.startsAt)),
    db.select().from(conversations).where(eq(conversations.contactId, id)),
    db.select({ id: leads.id, status: leads.status, source: leads.source, createdAt: leads.createdAt, ackDeadline: leads.ackDeadline, ownerId: leads.ownerId, assignedAt: leads.assignedAt })
      .from(leads).where(eq(leads.contactId, id)).orderBy(desc(leads.createdAt)),
    fieldsFor(ctx.workspaceId, "contact"),
  ]);
  const convMsgs = convs.length ? await db.select().from(messages).where(inArray(messages.conversationId, convs.map((c) => c.id))).orderBy(asc(messages.createdAt)).limit(500) : [];
  return {
    ...row, fields, leads: leadRows, appointments: appts,
    opportunities: opps.map((o) => maskValue(ctx, o)),
    // Payment amounts are the same money as opportunity value — masked by the same permission.
    payments: pays.map((p) => ctx.can("crm.view_value") ? p : { ...p, amountCents: null as number | null, refundedCents: null as number | null }),
    conversations: convs.map((c) => ({ ...c, messages: convMsgs.filter((m) => m.conversationId === c.id) })),
    activities: ctx.can("crm.view_value") ? acts : acts.map((a) => ({ ...a, data: redactValue(a.data) })),
  };
}

export async function createContact(ctx: Ctx, input: { firstName: string; lastName?: string; email?: string; phone?: string | null; companyId?: string | null; tags?: string[]; custom?: Record<string, unknown> }) {
  ctx.require("crm.create", "create contacts");
  const defs = await fieldsFor(ctx.workspaceId, "contact");
  const custom = validateCustom(defs, input.custom ?? {});
  if (input.companyId) await ownCompany(ctx, input.companyId);
  try {
    const [c] = await db.insert(contacts).values({
      workspaceId: ctx.workspaceId, firstName: input.firstName, lastName: input.lastName || null, email: input.email || null, phone: input.phone || null,
      companyId: input.companyId || null, tags: input.tags ?? [], custom, ownerId: ctx.userId,
    }).returning();
    await addActivity({ workspaceId: ctx.workspaceId, contactId: c.id, actorId: ctx.userId, type: "created", summary: "Contact created" });
    return c;
  } catch (e) {
    if (String(e).includes("contacts_ws_phone")) throw conflict("A contact with this phone number already exists.", { phone: "Already in use" });
    throw e;
  }
}

export async function updateContact(ctx: Ctx, id: string, version: number, patch: { firstName?: string; lastName?: string | null; email?: string | null; phone?: string | null; companyId?: string | null; tags?: string[]; optedOut?: boolean; custom?: Record<string, unknown> }) {
  ctx.require("crm.edit", "edit contacts");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
    if (!cur || (!ctx.can("crm.view_all") && cur.ownerId !== ctx.userId)) throw notFound("Contact");
    if (patch.companyId) await ownCompany(ctx, patch.companyId);
    const custom = patch.custom ? validateCustom(await fieldsFor(ctx.workspaceId, "contact", null, tx), patch.custom, cur.custom) : cur.custom;
    const next = {
      firstName: patch.firstName ?? cur.firstName, lastName: patch.lastName !== undefined ? patch.lastName : cur.lastName,
      email: patch.email !== undefined ? patch.email : cur.email, phone: patch.phone !== undefined ? patch.phone : cur.phone,
      companyId: patch.companyId !== undefined ? patch.companyId : cur.companyId, tags: patch.tags ?? cur.tags, custom,
      optedOut: patch.optedOut ?? cur.optedOut,
      optedOutAt: patch.optedOut === undefined ? cur.optedOutAt : patch.optedOut ? cur.optedOutAt ?? new Date() : null,
    };
    // Optimistic concurrency: the write only lands if nobody saved since this user loaded it (Q4).
    const [u] = await tx.update(contacts).set({ ...next, version: sql`${contacts.version} + 1`, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.version, version))).returning();
    if (!u) throw conflict(STALE);
    const changed = diff(cur as unknown as Record<string, unknown>, next);
    if (Object.keys(changed.after).length) {
      await addActivity({ workspaceId: ctx.workspaceId, contactId: id, actorId: ctx.userId, type: "field_edit",
        summary: `Updated ${Object.keys(changed.after).map(humanKey).join(", ")}`, data: changed }, tx);
      await touchLeadsForContact(tx, ctx.workspaceId, id, ctx.userId, "contact edit");
    }
    return u;
  });
}

export async function deleteContact(ctx: Ctx, id: string) {
  ctx.require("crm.delete", "delete contacts");
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
    if (!cur) throw notFound("Contact");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.contactId, id));
    if (n) throw conflict(`This contact has ${n} payment record(s). Payments are financial history and can't be deleted.`);
    await tx.delete(contacts).where(eq(contacts.id, id));
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "contact.deleted", targetType: "contact", targetId: id, before: cur }, tx);
  });
}

export async function addNote(ctx: Ctx, contactId: string, body: string, opportunityId?: string | null) {
  ctx.require("crm.edit", "add notes");
  await db.transaction(async (tx) => {
    const [c] = await tx.select({ id: contacts.id, ownerId: contacts.ownerId }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)));
    if (!c || (!ctx.can("crm.view_all") && c.ownerId !== ctx.userId)) throw notFound("Contact");
    await addActivity({ workspaceId: ctx.workspaceId, contactId, opportunityId: opportunityId ?? null, actorId: ctx.userId, type: "note", summary: body.slice(0, 4000) }, tx);
    await touchLeadsForContact(tx, ctx.workspaceId, contactId, ctx.userId, "note");
  });
}

/* ------------------------------------------------------------------ companies */
async function ownCompany(ctx: Ctx, id: string) {
  const [c] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, id), eq(companies.workspaceId, ctx.workspaceId)));
  if (!c) throw notFound("Company");
}

export async function listCompanies(ctx: Ctx) {
  ctx.require("crm.view", "view companies");
  return db.select({ id: companies.id, name: companies.name, domain: companies.domain,
    contacts: sql<number>`(select count(*)::int from contacts c where c.company_id = ${companies.id})` })
    .from(companies).where(eq(companies.workspaceId, ctx.workspaceId)).orderBy(asc(companies.name));
}

export async function createCompany(ctx: Ctx, name: string, domain?: string) {
  ctx.require("crm.create", "create companies");
  const [c] = await db.insert(companies).values({ workspaceId: ctx.workspaceId, name: name.trim(), domain: domain?.trim() || null }).returning();
  return c;
}

/* ------------------------------------------------------------------ opportunities */
export async function listBoard(ctx: Ctx, pipelineId: string, filters: Filter[] = []) {
  ctx.require("crm.view", "view the pipeline");
  const conds: (SQL | undefined)[] = [eq(opportunities.workspaceId, ctx.workspaceId), eq(opportunities.pipelineId, pipelineId)];
  if (!ctx.can("crm.view_all")) conds.push(eq(opportunities.ownerId, ctx.userId));
  for (const f of filters.filter(sane)) {
    const v = f.value.trim();
    if (f.field === "owner") conds.push(eq(opportunities.ownerId, v === "me" ? ctx.userId : v));
    else if (f.field === "stage") conds.push(eq(opportunities.stageId, v));
    else if (f.field === "tag") conds.push(sql`${v} = any(${contacts.tags})`);
    else if (f.field === "q") conds.push(or(ilike(opportunities.title, `%${v}%`), ilike(contacts.firstName, `%${v}%`)));
    else if (f.field === "created_after") conds.push(gte(opportunities.createdAt, new Date(v)));
    else if (f.field === "created_before") conds.push(lte(opportunities.createdAt, new Date(new Date(v).getTime() + 86_400_000)));
    else if (f.field.startsWith("custom:")) conds.push(sql`${opportunities.custom} ->> ${f.field.slice(7)} = ${v}`);
  }
  const rows = await db.select({
    id: opportunities.id, title: opportunities.title, valueCents: opportunities.valueCents, currency: opportunities.currency, stageId: opportunities.stageId,
    custom: opportunities.custom, version: opportunities.version, ownerName: users.name, ownerId: opportunities.ownerId,
    contactId: contacts.id, contactName: sql<string>`trim(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, ''))`, updatedAt: opportunities.updatedAt,
    paid: sql<boolean>`exists (select 1 from payments p where p.opportunity_id = ${opportunities.id} and p.status = 'paid')`,
  }).from(opportunities).innerJoin(contacts, eq(contacts.id, opportunities.contactId)).leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(and(...conds)).orderBy(desc(opportunities.updatedAt)).limit(500);
  return rows.map((r) => maskValue(ctx, r));
}

export async function getOpportunity(ctx: Ctx, id: string) {
  ctx.require("crm.view", "view opportunities");
  const [o] = await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ctx.workspaceId)));
  if (!o || (!ctx.can("crm.view_all") && o.ownerId !== ctx.userId)) throw notFound("Opportunity");
  return maskValue(ctx, o);
}

export async function createOpportunity(ctx: Ctx, input: { contactId: string; pipelineId: string; stageId?: string; title: string; valueCents?: number; currency?: string; custom?: Record<string, unknown> }) {
  ctx.require("crm.create", "create opportunities");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.workspaceId, ctx.workspaceId)));
    if (!c || (!ctx.can("crm.view_all") && c.ownerId !== ctx.userId)) throw notFound("Contact");
    const ss = await tx.select().from(stages).where(and(eq(stages.pipelineId, input.pipelineId), eq(stages.workspaceId, ctx.workspaceId))).orderBy(asc(stages.position));
    if (!ss.length) throw notFound("Pipeline");
    const stage = input.stageId ? ss.find((s) => s.id === input.stageId) : ss[0];
    if (!stage) throw notFound("Stage");
    const custom = validateCustom(await fieldsFor(ctx.workspaceId, "opportunity", input.pipelineId, tx), input.custom ?? {});
    const missing = await missingForStage(stage.id, custom, tx);
    if (missing.length) throw invalid(`"${stage.name}" requires: ${missing.map((m) => m.label).join(", ")}.`, Object.fromEntries(missing.map((m) => [m.key, "Required for this stage"])));
    const [o] = await tx.insert(opportunities).values({
      workspaceId: ctx.workspaceId, contactId: c.id, companyId: c.companyId, pipelineId: input.pipelineId, stageId: stage.id, title: input.title.trim(),
      // Users who can't see values can't set them either.
      valueCents: ctx.can("crm.view_value") ? Math.max(0, Math.round(input.valueCents ?? 0)) : 0,
      currency: (input.currency ?? "USD").toUpperCase(), custom, ownerId: c.ownerId ?? ctx.userId,
      closedAt: stage.kind === "open" ? null : new Date(),
    }).returning();
    await addActivity({ workspaceId: ctx.workspaceId, contactId: c.id, opportunityId: o.id, actorId: ctx.userId, type: "opportunity", summary: `Opportunity "${o.title}" created in ${stage.name}` }, tx);
    await touchLeadsForContact(tx, ctx.workspaceId, c.id, ctx.userId, "new opportunity");
    await tx.update(leads).set({ opportunityId: o.id }).where(and(eq(leads.contactId, c.id), sql`${leads.opportunityId} is null`, inArray(leads.status, ["assigned", "acknowledged"])));
    return o;
  });
}

export async function updateOpportunity(ctx: Ctx, id: string, version: number, patch: { title?: string; valueCents?: number; currency?: string; custom?: Record<string, unknown>; ownerId?: string }) {
  ctx.require("crm.edit", "edit opportunities");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ctx.workspaceId)));
    if (!cur || (!ctx.can("crm.view_all") && cur.ownerId !== ctx.userId)) throw notFound("Opportunity");
    if (patch.valueCents !== undefined && !ctx.can("crm.view_value")) throw invalid("You don't have permission to change opportunity values.");
    if (patch.ownerId) {
      const [u] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, patch.ownerId), eq(users.workspaceId, ctx.workspaceId)));
      if (!u) throw notFound("Employee");
    }
    const custom = patch.custom ? validateCustom(await fieldsFor(ctx.workspaceId, "opportunity", cur.pipelineId, tx), patch.custom, cur.custom) : cur.custom;
    // Removing a value that the current stage requires is blocked too.
    const missing = await missingForStage(cur.stageId, custom, tx);
    if (missing.length) throw invalid(`The current stage requires: ${missing.map((m) => m.label).join(", ")}.`, Object.fromEntries(missing.map((m) => [m.key, "Required for this stage"])));
    const next = { title: patch.title?.trim() || cur.title, valueCents: patch.valueCents !== undefined ? Math.max(0, Math.round(patch.valueCents)) : cur.valueCents,
      currency: patch.currency?.toUpperCase() ?? cur.currency, custom, ownerId: patch.ownerId ?? cur.ownerId };
    const [u] = await tx.update(opportunities).set({ ...next, version: sql`${opportunities.version} + 1`, updatedAt: new Date() })
      .where(and(eq(opportunities.id, id), eq(opportunities.version, version))).returning();
    if (!u) throw conflict(STALE);
    const changed = diff(cur as unknown as Record<string, unknown>, next);
    if (Object.keys(changed.after).length) {
      // Audit/activity never leak a masked value to someone who couldn't see it anyway (only value-permitted users can change it).
      await addActivity({ workspaceId: ctx.workspaceId, contactId: cur.contactId, opportunityId: id, actorId: ctx.userId, type: "field_edit",
        summary: `Updated ${Object.keys(changed.after).map(humanKey).join(", ")}`, data: changed }, tx);
      if (patch.ownerId && patch.ownerId !== cur.ownerId)
        await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "opportunity.reassigned", targetType: "opportunity", targetId: id, before: { ownerId: cur.ownerId }, after: { ownerId: patch.ownerId } }, tx);
      await touchLeadsForContact(tx, ctx.workspaceId, cur.contactId, ctx.userId, "opportunity edit");
    }
    return maskValue(ctx, u);
  });
}

/** F2.4 / F2.5 — moving is blocked with a clear message until the target stage's required fields are filled. */
export async function moveOpportunity(ctx: Ctx, id: string, stageId: string, version: number) {
  ctx.require("crm.edit", "move opportunities");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ctx.workspaceId)));
    if (!cur || (!ctx.can("crm.view_all") && cur.ownerId !== ctx.userId)) throw notFound("Opportunity");
    if (cur.stageId === stageId) return maskValue(ctx, cur);
    const [from] = await tx.select().from(stages).where(eq(stages.id, cur.stageId));
    const [to] = await tx.select().from(stages).where(and(eq(stages.id, stageId), eq(stages.pipelineId, cur.pipelineId)));
    if (!to) throw notFound("Stage");
    const missing = await missingForStage(to.id, cur.custom, tx);
    if (missing.length) throw invalid(`Fill in ${missing.map((m) => m.label).join(", ")} before moving to "${to.name}".`, { missing: missing.map((m) => m.key), stage: to.name });
    const [u] = await tx.update(opportunities).set({ stageId, closedAt: to.kind === "open" ? null : new Date(), version: sql`${opportunities.version} + 1`, updatedAt: new Date() })
      .where(and(eq(opportunities.id, id), eq(opportunities.version, version))).returning();
    if (!u) throw conflict(STALE);
    await addActivity({ workspaceId: ctx.workspaceId, contactId: cur.contactId, opportunityId: id, actorId: ctx.userId, type: "stage_change",
      summary: `Moved from ${from?.name ?? "?"} to ${to.name}`, data: { from: from?.id, to: to.id } }, tx);
    await touchLeadsForContact(tx, ctx.workspaceId, cur.contactId, ctx.userId, "stage change");
    return maskValue(ctx, u);
  });
}

export async function deleteOpportunity(ctx: Ctx, id: string) {
  ctx.require("crm.delete", "delete opportunities");
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ctx.workspaceId)));
    if (!cur) throw notFound("Opportunity");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.opportunityId, id));
    if (n) throw conflict(`This opportunity has ${n} payment record(s) and can't be deleted. Move it to a Lost stage instead.`);
    await tx.delete(opportunities).where(eq(opportunities.id, id));
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "opportunity.deleted", targetType: "opportunity", targetId: id, before: cur }, tx);
  });
}

/* ------------------------------------------------------------------ export (crm.export, masked) */
export async function exportContactsCsv(ctx: Ctx, filters: Filter[]) {
  ctx.require("crm.export", "export records");
  const { rows } = await listContacts(ctx, filters, 1, 10_000);
  const head = ["First name", "Last name", "Email", "Phone", "Company", "Owner", "Tags", "Open opportunities", "Created"];
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard (Q3)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [r.firstName, r.lastName, r.email, r.phone, r.companyName, r.ownerName, r.tags.join("; "), r.openOpps, r.createdAt.toISOString()].map(esc).join(","));
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "contacts.exported", targetType: "contact", after: { count: rows.length, filters } });
  return [head.join(","), ...lines].join("\n");
}

export async function exportOpportunitiesCsv(ctx: Ctx, pipelineId: string) {
  ctx.require("crm.export", "export records");
  const rows = await listBoard(ctx, pipelineId);
  const ss = await db.select().from(stages).where(eq(stages.pipelineId, pipelineId));
  const head = ["Title", "Contact", "Stage", "Owner", "Value", "Currency", "Updated"];
  const lines = rows.map((r) => [r.title, r.contactName, ss.find((s) => s.id === r.stageId)?.name, r.ownerName,
    r.valueMasked ? "Hidden" : ((r.valueCents ?? 0) / 100).toFixed(2), r.currency, r.updatedAt.toISOString()]
    .map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@]/.test(s) ? "'" + s : s; }).join(","));
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "opportunities.exported", targetType: "pipeline", targetId: pipelineId, after: { count: rows.length, valuesMasked: !ctx.can("crm.view_value") } });
  return [head.join(","), ...lines].join("\n");
}

/* ------------------------------------------------------------------ saved lists */
export async function saveList(ctx: Ctx, name: string, entity: "contacts" | "opportunities", filters: Filter[]) {
  ctx.require("crm.view", "save lists");
  if (filters.filter((f) => f.value?.trim()).length < 1) throw invalid("Add at least one filter before saving.");
  const [l] = await db.insert(schema.savedLists).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, name: name.trim(), entity, filters }).returning();
  return l;
}
export const mySavedLists = (ctx: Ctx, entity: string) =>
  db.select().from(schema.savedLists).where(and(eq(schema.savedLists.workspaceId, ctx.workspaceId), eq(schema.savedLists.userId, ctx.userId), eq(schema.savedLists.entity, entity))).orderBy(asc(schema.savedLists.createdAt));
export async function deleteSavedList(ctx: Ctx, id: string) {
  await db.delete(schema.savedLists).where(and(eq(schema.savedLists.id, id), eq(schema.savedLists.userId, ctx.userId)));
}

/* ------------------------------------------------------------------ helpers */
function redactValue(data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  for (const side of ["before", "after"]) {
    const v = out[side] as Record<string, unknown> | undefined;
    if (v && "valueCents" in v) out[side] = { ...v, valueCents: "hidden" };
  }
  return out;
}
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (k === "custom") {
      const bc = (before.custom ?? {}) as Record<string, unknown>, ac = (after.custom ?? {}) as Record<string, unknown>;
      for (const ck of new Set([...Object.keys(bc), ...Object.keys(ac)])) if (JSON.stringify(bc[ck]) !== JSON.stringify(ac[ck])) { b[ck] = bc[ck] ?? null; a[ck] = ac[ck] ?? null; }
    } else if (k !== "optedOutAt" && JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k] ?? null; a[k] = after[k] ?? null; }
  }
  return { before: b, after: a };
}
const humanKey = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().replace("value cents", "value");

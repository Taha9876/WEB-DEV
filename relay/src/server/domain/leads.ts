import { and, asc, eq, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "../db";
import { audit } from "../audit";
import { addActivity } from "./activity";
import { publish } from "../realtime";
import { conflict, forbidden, notFound } from "../errors";
import type { EscalationStep } from "../db/schema";

const { leads, users, leadSettings, leadAssignments, contacts, jobs } = schema;
type Lead = typeof leads.$inferSelect;
type Kind = (typeof schema.assignmentKindEnum.enumValues)[number];
const OPEN = ["assigned", "acknowledged"] as const;

export async function getSettings(workspaceId: string, tx: Tx | typeof db = db) {
  const [s] = await tx.select().from(leadSettings).where(eq(leadSettings.workspaceId, workspaceId));
  if (s) return s;
  const [created] = await tx.insert(leadSettings).values({ workspaceId }).onConflictDoNothing().returning();
  return created ?? (await tx.select().from(leadSettings).where(eq(leadSettings.workspaceId, workspaceId)))[0];
}

/** Serialises assignment decisions per workspace so round-robin and capacity checks can't race (Q5). */
const lockWorkspace = (tx: Tx, workspaceId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"assign:" + workspaceId}))`);

/**
 * Round-robin among Available employees under the open-lead cap (F3.3).
 * "Available employee" = status Available AND open leads < limit (glossary).
 */
async function pickRoundRobin(tx: Tx, workspaceId: string, max: number, exclude: string[]) {
  const open = tx
    .select({ ownerId: leads.ownerId, n: sql<number>`count(*)::int`.as("n") })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.status, [...OPEN])))
    .groupBy(leads.ownerId)
    .as("open");
  const [u] = await tx
    .select({ id: users.id })
    .from(users)
    .leftJoin(open, eq(open.ownerId, users.id))
    .where(and(
      eq(users.workspaceId, workspaceId),
      eq(users.status, "available"),
      isNull(users.deactivatedAt),
      sql`coalesce(${open.n}, 0) < ${max}`,
      exclude.length ? notInArray(users.id, exclude) : undefined,
    ))
    .orderBy(sql`${users.lastAssignedAt} asc nulls first`, asc(users.id))
    .limit(1);
  return u?.id ?? null;
}

async function isAvailable(tx: Tx, workspaceId: string, userId: string) {
  const [u] = await tx.select({ s: users.status, d: users.deactivatedAt }).from(users)
    .where(and(eq(users.id, userId), eq(users.workspaceId, workspaceId)));
  return !!u && u.s === "available" && !u.d;
}

/** Everyone who has owned this lead — escalation never bounces back to them. */
async function previousOwners(tx: Tx, leadId: string) {
  const rows = await tx.selectDistinct({ id: leadAssignments.userId }).from(leadAssignments).where(eq(leadAssignments.leadId, leadId));
  return rows.map((r) => r.id).filter(Boolean) as string[];
}

/** Moves the lead to `toUserId` (or unassigned). Caller must hold the lead row lock. */
async function setOwner(
  tx: Tx, lead: Lead, toUserId: string | null,
  o: { kind: Kind; level: number; reason: string; windowSeconds: number; actorId: string | null },
) {
  const now = new Date();
  await tx.update(leadAssignments).set({ endedAt: now })
    .where(and(eq(leadAssignments.leadId, lead.id), isNull(leadAssignments.endedAt)));

  const escalated = o.kind === "escalation";
  const [updated] = await tx.update(leads).set({
    ownerId: toUserId,
    status: toUserId ? "assigned" : "unassigned",
    assignedAt: toUserId ? now : null,
    ackDeadline: toUserId ? new Date(now.getTime() + o.windowSeconds * 1000) : null,
    acknowledgedAt: null,
    exhaustedAt: null,
    firstAssignedAt: lead.firstAssignedAt ?? (toUserId ? now : null),
    escalationLevel: o.level,
    escalationCount: escalated ? sql`${leads.escalationCount} + 1` : leads.escalationCount,
    version: sql`${leads.version} + 1`,
  }).where(eq(leads.id, lead.id)).returning();

  if (toUserId) {
    await tx.insert(leadAssignments).values({
      workspaceId: lead.workspaceId, leadId: lead.id, userId: toUserId, kind: o.kind, level: o.level, reason: o.reason,
    });
    await tx.update(users).set({ lastAssignedAt: now }).where(eq(users.id, toUserId));
    await tx.update(contacts).set({ ownerId: toUserId }).where(eq(contacts.id, lead.contactId));
  }

  const action = escalated ? "lead.escalated" : toUserId ? "lead.assigned" : "lead.unassigned";
  await audit({
    workspaceId: lead.workspaceId, actorId: o.actorId, action, targetType: "lead", targetId: lead.id,
    before: { ownerId: lead.ownerId, status: lead.status, level: lead.escalationLevel },
    after: { ownerId: toUserId, status: updated.status, level: o.level, kind: o.kind, reason: o.reason },
  }, tx);
  await addActivity({
    workspaceId: lead.workspaceId, contactId: lead.contactId, opportunityId: lead.opportunityId, leadId: lead.id,
    actorId: o.actorId, type: escalated ? "escalation" : "assignment",
    summary: toUserId ? `${escalated ? "Escalated" : "Assigned"}: ${o.reason}` : `Unassigned: ${o.reason}`,
    data: { from: lead.ownerId, to: toUserId, kind: o.kind, level: o.level },
  }, tx);

  if (escalated && toUserId && lead.escalationCount === 0) {
    const s = await getSettings(lead.workspaceId, tx);
    if (s.aiFirstResponse) await tx.insert(jobs).values({ workspaceId: lead.workspaceId, kind: "ai_first_response", payload: { leadId: lead.id }, maxAttempts: 2 });
  }
  if (escalated && toUserId) {
    // Durable outbox: the external alert survives restarts and is retried (F3.9, I4.4).
    await tx.insert(jobs).values({
      workspaceId: lead.workspaceId, kind: "notify_escalation",
      payload: { leadId: lead.id, userId: toUserId, reason: o.reason },
    });
  }
  return updated;
}

/** Initial (or re-)assignment via round-robin. */
async function assignRoundRobin(tx: Tx, lead: Lead, kind: Kind, reason: string, actorId: string | null, exclude: string[] = []) {
  const s = await getSettings(lead.workspaceId, tx);
  await lockWorkspace(tx, lead.workspaceId);
  const to = await pickRoundRobin(tx, lead.workspaceId, s.maxOpenLeads, exclude);
  return setOwner(tx, lead, to, {
    kind, level: 0, actorId, windowSeconds: s.ackWindowSeconds,
    reason: to ? reason : "No available employee under the open-lead limit",
  });
}

/* ---------------- Public API ---------------- */

export async function createLead(input: {
  workspaceId: string; contactId: string; source: Lead["source"]; message?: string | null;
  opportunityId?: string | null; actorId?: string | null;
}, outer?: Tx) {
  const run = async (tx: Tx) => {
    const [lead] = await tx.insert(leads).values({
      workspaceId: input.workspaceId, contactId: input.contactId, source: input.source,
      message: input.message ?? null, opportunityId: input.opportunityId ?? null,
    }).returning();
    await audit({ workspaceId: input.workspaceId, actorId: input.actorId ?? null, action: "lead.created", targetType: "lead", targetId: lead.id, after: { source: input.source } }, tx);
    await addActivity({ workspaceId: input.workspaceId, contactId: input.contactId, leadId: lead.id, actorId: input.actorId ?? null, type: "lead", summary: `New lead from ${input.source.replace("_", " ")}` }, tx);
    if (input.message?.trim()) await tx.insert(jobs).values({ workspaceId: input.workspaceId, kind: "ai_triage", payload: { leadId: lead.id }, maxAttempts: 3 });
    return assignRoundRobin(tx, lead, "initial", "Round-robin", null);
  };
  const lead = outer ? await run(outer) : await db.transaction(run);
  await publish(input.workspaceId, { type: "lead.created", leadId: lead.id, ownerId: lead.ownerId });
  return lead;
}

/** Explicit acknowledge, or implicit via any recorded action by the owner (glossary: Acknowledged). */
export async function acknowledge(workspaceId: string, leadId: string, userId: string, via = "acknowledge", outer?: Tx) {
  const run = async (tx: Tx) => {
    const [lead] = await tx.select().from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId))).for("update");
    if (!lead) throw notFound("Lead");
    if (lead.ownerId !== userId) throw conflict("This lead is no longer assigned to you — it was reassigned.");
    if (lead.status !== "assigned") return lead;
    const now = new Date();
    const [u] = await tx.update(leads).set({
      status: "acknowledged", acknowledgedAt: now, firstAcknowledgedAt: lead.firstAcknowledgedAt ?? now,
      ackDeadline: null, exhaustedAt: null, lastActionAt: now, version: sql`${leads.version} + 1`,
    }).where(eq(leads.id, leadId)).returning();
    await audit({ workspaceId, actorId: userId, action: "lead.acknowledged", targetType: "lead", targetId: leadId, before: { status: lead.status }, after: { status: "acknowledged", via } }, tx);
    await addActivity({ workspaceId, contactId: lead.contactId, leadId, actorId: userId, type: "acknowledgement", summary: via === "acknowledge" ? "Acknowledged lead" : `Acknowledged via ${via}` }, tx);
    return u;
  };
  const lead = outer ? await run(outer) : await db.transaction(run);
  await publish(workspaceId, { type: "lead.acknowledged", leadId, ownerId: userId });
  return lead;
}

/** Called after notes, messages, stage changes, appointments on a contact (F3 glossary). */
export async function touchLeadsForContact(tx: Tx, workspaceId: string, contactId: string, userId: string, via: string) {
  const open = await tx.select({ id: leads.id, status: leads.status }).from(leads).where(and(
    eq(leads.workspaceId, workspaceId), eq(leads.contactId, contactId), eq(leads.ownerId, userId), inArray(leads.status, [...OPEN]),
  ));
  for (const l of open) {
    if (l.status === "assigned") await acknowledge(workspaceId, l.id, userId, via, tx);
    else await tx.update(leads).set({ lastActionAt: new Date() }).where(eq(leads.id, l.id));
  }
}

export async function reassign(workspaceId: string, leadId: string, toUserId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId))).for("update");
    if (!lead) throw notFound("Lead");
    const [target] = await tx.select().from(users).where(and(eq(users.id, toUserId), eq(users.workspaceId, workspaceId)));
    if (!target || target.deactivatedAt) throw notFound("Employee");
    if (target.status === "on_leave" || target.status === "offline") throw forbidden(`assign leads to someone who is ${target.status.replace("_", " ")}`);
    const s = await getSettings(workspaceId, tx);
    const r = await setOwner(tx, lead, toUserId, { kind: "manual", level: lead.escalationLevel, reason: "Manual reassignment", windowSeconds: s.ackWindowSeconds, actorId });
    await publish(workspaceId, { type: "lead.assigned", leadId, ownerId: toUserId });
    return r;
  });
}

/** F3.6 — going On leave / Offline moves unacknowledged leads now; acknowledged ones per workspace policy. */
export async function handleAbsence(workspaceId: string, userId: string, actorId: string | null) {
  const s = await getSettings(workspaceId);
  const statuses: Lead["status"][] = s.acknowledgedOnAbsence === "reassign" ? ["assigned", "acknowledged"] : ["assigned"];
  const ids = await db.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.ownerId, userId), inArray(leads.status, statuses)));
  for (const { id } of ids) {
    await db.transaction(async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, id)).for("update");
      if (!lead || lead.ownerId !== userId || !statuses.includes(lead.status)) return;
      await assignRoundRobin(tx, lead, "absence", "Previous owner became unavailable", actorId, [userId]);
    });
    await publish(workspaceId, { type: "lead.assigned", leadId: id });
  }
  return ids.length;
}

/**
 * Worker tick: escalate leads whose window expired (F3.5).
 * FOR UPDATE SKIP LOCKED + re-checked predicate = each expiry is processed exactly once,
 * even with several workers or two timers firing together (F3.8, Q5).
 */
export async function escalateDue(limit = 25) {
  const due = await db.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.status, "assigned"), lte(leads.ackDeadline, new Date())))
    .orderBy(asc(leads.ackDeadline)).limit(limit);
  let n = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const [lead] = await tx.select().from(leads)
        .where(and(eq(leads.id, id), eq(leads.status, "assigned"), lte(leads.ackDeadline, new Date())))
        .for("update", { skipLocked: true });
      if (!lead) return null;
      const s = await getSettings(lead.workspaceId, tx);
      const chain = s.escalationChain as EscalationStep[];
      await lockWorkspace(tx, lead.workspaceId);
      const exclude = await previousOwners(tx, lead.id);
      let to: string | null = null, level = lead.escalationLevel, reason = "";
      // Walk forward from the current level, skipping steps with no eligible target.
      for (let i = lead.escalationLevel; i < chain.length && !to; i++) {
        const step = chain[i];
        level = i + 1;
        if (step.type === "next_eligible") {
          to = await pickRoundRobin(tx, lead.workspaceId, s.maxOpenLeads, exclude);
          reason = "Not acknowledged in time — next available employee";
        } else if (step.userId && step.userId !== lead.ownerId) {
          // Backup must be available; the manager is the last resort and always receives it.
          if (step.type === "manager" || (await isAvailable(tx, lead.workspaceId, step.userId))) {
            to = step.userId;
            reason = `Not acknowledged in time — ${step.type === "backup" ? "designated backup" : "manager"}`;
          }
        }
        if (to) {
          await setOwner(tx, lead, to, { kind: "escalation", level, reason, windowSeconds: step.seconds, actorId: null });
          return to;
        }
      }
      // Chain exhausted: last owner keeps it, timer stops, recovery queue picks it up.
      await tx.update(leads).set({ ackDeadline: null, exhaustedAt: new Date() }).where(eq(leads.id, id));
      await audit({ workspaceId: lead.workspaceId, actorId: null, action: "lead.escalation_exhausted", targetType: "lead", targetId: id, after: { ownerId: lead.ownerId } }, tx);
      return null;
    });
    if (done) { n++; const [l] = await db.select().from(leads).where(eq(leads.id, id)); await publish(l.workspaceId, { type: "lead.escalated", leadId: id, ownerId: done }); }
  }
  return n;
}

/** Worker tick: leads nobody could take earlier get retried as people become available. */
export async function assignWaiting(limit = 25) {
  const waiting = await db.select({ id: leads.id, ws: leads.workspaceId }).from(leads)
    .where(eq(leads.status, "unassigned")).orderBy(asc(leads.createdAt)).limit(limit);
  for (const w of waiting) {
    const r = await db.transaction(async (tx) => {
      const [lead] = await tx.select().from(leads).where(and(eq(leads.id, w.id), eq(leads.status, "unassigned"))).for("update", { skipLocked: true });
      if (!lead) return null;
      const s = await getSettings(lead.workspaceId, tx);
      await lockWorkspace(tx, lead.workspaceId);
      const to = await pickRoundRobin(tx, lead.workspaceId, s.maxOpenLeads, []);
      if (!to) return null;
      return setOwner(tx, lead, to, { kind: "recovery", level: lead.escalationLevel, reason: "Employee became available", windowSeconds: s.ackWindowSeconds, actorId: null });
    });
    if (r) await publish(w.ws, { type: "lead.assigned", leadId: w.id, ownerId: r.ownerId });
  }
}

/** F3.7 — every lead at risk, with the reason. */
export async function recoveryQueue(workspaceId: string, ownerId?: string) {
  const s = await getSettings(workspaceId);
  const rows = await db.execute<{
    id: string; status: string; owner_id: string | null; owner_name: string | null; contact_id: string; contact_name: string;
    source: string; escalation_count: number; ack_deadline: Date | null; exhausted_at: Date | null; last_touch: Date; created_at: Date;
  }>(sql`
    select l.id, l.status, l.owner_id, u.name as owner_name, l.contact_id,
           trim(c.first_name || ' ' || coalesce(c.last_name, '')) as contact_name,
           l.source, l.escalation_count, l.ack_deadline, l.exhausted_at, coalesce(l.last_action_at, l.created_at) as last_touch, l.created_at
    from leads l
    join contacts c on c.id = l.contact_id
    left join users u on u.id = l.owner_id
    where l.workspace_id = ${workspaceId} and l.status <> 'closed'
      ${ownerId ? sql`and l.owner_id = ${ownerId}` : sql``}
      and (
        l.status = 'unassigned'
        or (l.status = 'assigned' and (l.ack_deadline < now() or l.exhausted_at is not null))
        or l.escalation_count >= 2
        or coalesce(l.last_action_at, l.created_at) < now() - make_interval(secs => ${s.idleSeconds})
      )
    order by l.created_at asc`);
  const now = Date.now();
  return rows.map((r) => {
    const reasons: string[] = [];
    if (r.status === "unassigned") reasons.push("No eligible employee available");
    if (r.status === "assigned" && (r.exhausted_at || (r.ack_deadline && new Date(r.ack_deadline).getTime() < now)))
      reasons.push(r.exhausted_at ? "Unacknowledged — escalation chain exhausted" : "Unacknowledged beyond window");
    if (r.escalation_count >= 2) reasons.push(`Escalated ${r.escalation_count} times`);
    if (new Date(r.last_touch).getTime() < now - s.idleSeconds * 1000) reasons.push("No recorded action within idle period");
    return { ...r, reasons };
  });
}

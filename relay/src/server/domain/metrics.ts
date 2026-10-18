import { TZDate } from "@date-fns/tz";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Ctx } from "../context";
import { recoveryQueue } from "./leads";
import { seesAll } from "./leads-read";

/**
 * F5 — every figure follows the Section 7 glossary and is computed from the same tables the
 * drill-down lists read, so a number and its list always agree (F5.2, Q12).
 *   Time to first response = first acknowledgement − first assignment
 *   Escalation             = automatic reassignment after an expired window (manual reassignments excluded)
 *   Open pipeline value    = Σ value of opportunities in stages of kind "open", by stage
 *   Collected revenue      = Σ provider-confirmed payments − confirmed refunds
 *   Projected revenue      = open opportunity value + unpaid payment requests
 */
export function startOfToday(tz: string) { const n = new TZDate(Date.now(), tz); return new Date(new TZDate(n.getFullYear(), n.getMonth(), n.getDate(), tz).getTime()); }
export function startOfMonth(tz: string) { const n = new TZDate(Date.now(), tz); return new Date(new TZDate(n.getFullYear(), n.getMonth(), 1, tz).getTime()); }

export async function dashboard(ctx: Ctx) {
  const ws = ctx.workspaceId, me = ctx.userId;
  const company = seesAll(ctx);
  const tz = ctx.user.timezone;
  const today = startOfToday(tz), month = startOfMonth(tz);
  const own = (col: unknown) => (company ? sql`true` : sql`${col} = ${me}`);
  const L = schema.leads;

  const [[newToday], [ttfr], [esc], byStage, [money], avail, appts, recovery] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(L).where(and(eq(L.workspaceId, ws), sql`${L.createdAt} >= ${today}`, own(L.ownerId))),
    db.select({ avg: sql<number | null>`avg(extract(epoch from ${L.firstAcknowledgedAt} - ${L.firstAssignedAt}))::float`, n: sql<number>`count(*)::int` })
      .from(L).where(and(eq(L.workspaceId, ws), sql`${L.firstAcknowledgedAt} is not null and ${L.firstAssignedAt} is not null`, sql`${L.createdAt} >= now() - interval '30 days'`, own(L.ownerId))),
    db.select({ n: sql<number>`count(distinct ${schema.leadAssignments.leadId})::int` }).from(schema.leadAssignments)
      .where(and(eq(schema.leadAssignments.workspaceId, ws), eq(schema.leadAssignments.kind, "escalation"), sql`${schema.leadAssignments.assignedAt} >= now() - interval '24 hours'`, own(schema.leadAssignments.userId))),
    ctx.can("crm.view_value")
      ? db.select({ stageId: schema.stages.id, stage: schema.stages.name, pipeline: schema.pipelines.name, position: schema.stages.position, value: sql<number>`coalesce(sum(${schema.opportunities.valueCents}), 0)::bigint`.mapWith(Number), n: sql<number>`count(${schema.opportunities.id})::int` })
          .from(schema.stages).innerJoin(schema.pipelines, eq(schema.pipelines.id, schema.stages.pipelineId))
          .leftJoin(schema.opportunities, and(eq(schema.opportunities.stageId, schema.stages.id), own(schema.opportunities.ownerId)))
          .where(and(eq(schema.stages.workspaceId, ws), eq(schema.stages.kind, "open")))
          .groupBy(schema.stages.id, schema.stages.name, schema.pipelines.name, schema.pipelines.position, schema.stages.position)
          .orderBy(schema.pipelines.position, schema.stages.position)
      : Promise.resolve(null),
    db.select({
      collected: sql<number>`coalesce(sum(case when ${schema.payments.status} in ('paid','partially_refunded','refunded') and ${schema.payments.paidAt} >= ${month} then ${schema.payments.amountCents} - ${schema.payments.refundedCents} end), 0)::bigint`.mapWith(Number),
      pending: sql<number>`coalesce(sum(case when ${schema.payments.status} = 'pending' then ${schema.payments.amountCents} end), 0)::bigint`.mapWith(Number),
      paidCount: sql<number>`count(*) filter (where ${schema.payments.status} in ('paid','partially_refunded','refunded') and ${schema.payments.paidAt} >= ${month})::int`,
    }).from(schema.payments).where(and(eq(schema.payments.workspaceId, ws), own(schema.payments.requestedBy))),
    db.select({ id: schema.users.id, name: schema.users.name, status: schema.users.status,
      open: sql<number>`(select count(*)::int from leads l where l.owner_id = ${schema.users.id} and l.status in ('assigned','acknowledged'))` })
      .from(schema.users).where(and(eq(schema.users.workspaceId, ws), sql`${schema.users.deactivatedAt} is null`)).orderBy(schema.users.name),
    db.select({ id: schema.appointments.id, title: schema.appointments.title, startsAt: schema.appointments.startsAt, contactId: schema.appointments.contactId, who: schema.users.name })
      .from(schema.appointments).innerJoin(schema.users, eq(schema.users.id, schema.appointments.userId))
      .where(and(eq(schema.appointments.workspaceId, ws), eq(schema.appointments.status, "scheduled"), sql`${schema.appointments.startsAt} >= now()`, sql`${schema.appointments.startsAt} < now() + interval '7 days'`, own(schema.appointments.userId)))
      .orderBy(schema.appointments.startsAt).limit(5),
    recoveryQueue(ws, company ? undefined : me),
  ]);
  const openValue = byStage?.reduce((a, s) => a + s.value, 0) ?? null;
  return {
    scope: company ? "company" as const : "personal" as const, timezone: tz,
    newLeadsToday: newToday.n,
    avgFirstResponseSec: ttfr.avg, responsesMeasured: ttfr.n,
    recoveryCount: recovery.length,
    escalations24h: esc.n,
    pipelineByStage: byStage,
    openPipelineValue: openValue,
    collectedThisMonth: ctx.can("crm.view_value") ? money.collected : null, paymentsThisMonth: money.paidCount,
    projected: ctx.can("crm.view_value") && openValue !== null ? openValue + money.pending : null,
    availability: avail,
    upcoming: appts,
  };
}

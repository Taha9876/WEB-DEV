import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import type { Ctx } from "../context";
import { notFound } from "../errors";

const { leads, contacts, users, leadAssignments } = schema;

/** Users without team-wide visibility only see leads they own (F1.2, I1.6). */
export const seesAll = (ctx: Ctx) => ctx.can("crm.view_all") || ctx.can("leads.manage");

export type LeadFilter = "open" | "mine" | "unassigned" | "acknowledged" | "closed" | "all";

export async function listLeads(ctx: Ctx, filter: LeadFilter = "open", page = 1, pageSize = 50) {
  const conds: (SQL | undefined)[] = [eq(leads.workspaceId, ctx.workspaceId)];
  if (!seesAll(ctx) || filter === "mine") conds.push(eq(leads.ownerId, ctx.userId));
  if (filter === "open" || filter === "mine") conds.push(inArray(leads.status, ["unassigned", "assigned", "acknowledged"]));
  if (filter === "unassigned") conds.push(eq(leads.status, "unassigned"));
  if (filter === "acknowledged") conds.push(eq(leads.status, "acknowledged"));
  if (filter === "closed") conds.push(eq(leads.status, "closed"));

  const rows = await db
    .select({
      id: leads.id, status: leads.status, source: leads.source, message: leads.message, ownerId: leads.ownerId,
      ackDeadline: leads.ackDeadline, assignedAt: leads.assignedAt, escalationCount: leads.escalationCount,
      exhaustedAt: leads.exhaustedAt, createdAt: leads.createdAt,
      contactId: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, phone: contacts.phone,
      ownerName: users.name, ownerStatus: users.status,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(and(...conds))
    // Urgent first: running timers by deadline, then the rest newest-first.
    .orderBy(sql`case when ${leads.status} = 'assigned' then 0 when ${leads.status} = 'unassigned' then 1 else 2 end`, sql`${leads.ackDeadline} asc nulls last`, desc(leads.createdAt))
    .limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function getLead(ctx: Ctx, id: string) {
  const assignee = alias(users, "assignee");
  const [row] = await db
    .select({ lead: leads, contact: contacts, ownerName: users.name })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(and(eq(leads.id, id), eq(leads.workspaceId, ctx.workspaceId)));
  // Same 404 for "not yours" and "doesn't exist": identifiers reveal nothing (F1.6, Q2).
  if (!row || (!seesAll(ctx) && row.lead.ownerId !== ctx.userId)) throw notFound("Lead");
  const history = await db
    .select({ id: leadAssignments.id, kind: leadAssignments.kind, level: leadAssignments.level, reason: leadAssignments.reason,
      assignedAt: leadAssignments.assignedAt, endedAt: leadAssignments.endedAt, name: assignee.name })
    .from(leadAssignments)
    .leftJoin(assignee, eq(assignee.id, leadAssignments.userId))
    .where(eq(leadAssignments.leadId, id))
    .orderBy(leadAssignments.assignedAt);
  return { ...row, history };
}

export async function teamForAssignment(ctx: Ctx) {
  return db.select({ id: users.id, name: users.name, status: users.status }).from(users)
    .where(and(eq(users.workspaceId, ctx.workspaceId), sql`${users.deactivatedAt} is null`)).orderBy(users.name);
}

import { TZDate } from "@date-fns/tz";
import { and, eq, gte, asc } from "drizzle-orm";
import { db, schema } from "../db";
import type { Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { publish } from "../realtime";
import { addActivity } from "./activity";
import { touchLeadsForContact } from "./leads";
import { busyTimes, CalendarError, createEvent, deleteEvent, patchEvent } from "../integrations/google";

const { appointments, contacts, users, opportunities } = schema;

/** "2026-10-20T14:30" in `tz` → the exact instant. Stored as timestamptz, so never ambiguous (I3.5). */
export function localToInstant(local: string, tz: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw invalid("Pick a date and time.");
  try { Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw invalid("Unknown time zone."); }
  return new Date(new TZDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, tz).getTime());
}

const calErr = (e: unknown): never => {
  if (e instanceof CalendarError) throw conflict(e.message, { needsReconnect: e.needsReconnect });
  throw e;
};

async function contactFor(ctx: Ctx, contactId: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)));
  if (!c || (!ctx.can("crm.view_all") && c.ownerId !== ctx.userId)) throw notFound("Contact");
  return c;
}

async function employee(ctx: Ctx, userId: string) {
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.workspaceId, ctx.workspaceId)));
  if (!u) throw notFound("Employee");
  return u;
}

/** I3.4 — overlaps with the employee's real busy times. */
export async function checkConflicts(ctx: Ctx, userId: string, start: Date, end: Date) {
  await employee(ctx, userId);
  const busy = await busyTimes(ctx.workspaceId, userId, new Date(start.getTime() - 6 * 3600_000), new Date(end.getTime() + 6 * 3600_000)).catch(calErr);
  return { busy, overlaps: busy.filter((b) => b.start < end && b.end > start) };
}

export async function book(ctx: Ctx, input: { contactId: string; opportunityId?: string | null; userId: string; title: string; local: string; durationMin: number; timezone: string; force?: boolean }) {
  ctx.require("crm.edit", "book appointments");
  const c = await contactFor(ctx, input.contactId);
  const emp = await employee(ctx, input.userId);
  if (input.opportunityId) {
    const [o] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.contactId, c.id)));
    if (!o) throw notFound("Opportunity");
  }
  const start = localToInstant(input.local, input.timezone);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  if (start.getTime() < Date.now() - 60_000) throw invalid("That time is in the past.");
  const { overlaps } = await checkConflicts(ctx, emp.id, start, end);
  if (overlaps.length && !input.force)
    throw conflict(`${emp.name} is busy at that time (${overlaps.length} overlapping event${overlaps.length > 1 ? "s" : ""}). Pick another slot or book anyway.`, { overlaps, canForce: true });

  const eventId = await createEvent(ctx.workspaceId, emp.id, {
    title: input.title, start, end, timezone: input.timezone, attendeeEmail: c.email,
    description: `Booked from Relay with ${c.firstName} ${c.lastName ?? ""}${c.phone ? ` (${c.phone})` : ""}.`,
  }).catch(calErr);
  const [a] = await db.insert(appointments).values({
    workspaceId: ctx.workspaceId, contactId: c.id, opportunityId: input.opportunityId ?? null, userId: emp.id, title: input.title,
    startsAt: start, endsAt: end, timezone: input.timezone, googleEventId: eventId, createdBy: ctx.userId,
  }).returning();
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: input.timezone }).format(start);
  await db.transaction(async (tx) => {
    await addActivity({ workspaceId: ctx.workspaceId, contactId: c.id, opportunityId: input.opportunityId ?? null, actorId: ctx.userId, type: "appointment",
      summary: `Appointment booked with ${emp.name}: ${input.title} — ${when} (${input.timezone})${overlaps.length ? " · booked over a conflict" : ""}`, data: { appointmentId: a.id } }, tx);
    await touchLeadsForContact(tx, ctx.workspaceId, c.id, ctx.userId, "appointment");
  });
  await publish(ctx.workspaceId, { type: "appointment.updated", appointmentId: a.id });
  return a;
}

async function own(ctx: Ctx, id: string) {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.workspaceId, ctx.workspaceId)));
  if (!a) throw notFound("Appointment");
  await contactFor(ctx, a.contactId);
  return a;
}

/** I3.6 — changes go to Google first; the record and history only change if Google accepted it. */
export async function reschedule(ctx: Ctx, id: string, local: string, durationMin: number) {
  ctx.require("crm.edit", "change appointments");
  const a = await own(ctx, id);
  if (a.status === "cancelled") throw conflict("This appointment was cancelled.");
  const start = localToInstant(local, a.timezone), end = new Date(start.getTime() + durationMin * 60_000);
  if (a.googleEventId) await patchEvent(ctx.workspaceId, a.userId, a.googleEventId, { start, end, timezone: a.timezone }).catch(calErr);
  await db.update(appointments).set({ startsAt: start, endsAt: end, updatedAt: new Date() }).where(eq(appointments.id, id));
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: a.timezone }).format(d);
  await addActivity({ workspaceId: ctx.workspaceId, contactId: a.contactId, opportunityId: a.opportunityId, actorId: ctx.userId, type: "appointment",
    summary: `Appointment rescheduled: ${fmt(a.startsAt)} → ${fmt(start)} (${a.timezone})`, data: { appointmentId: id } });
  await publish(ctx.workspaceId, { type: "appointment.updated", appointmentId: id });
}

export async function cancel(ctx: Ctx, id: string) {
  ctx.require("crm.edit", "cancel appointments");
  const a = await own(ctx, id);
  if (a.status === "cancelled") return;
  if (a.googleEventId) await deleteEvent(ctx.workspaceId, a.userId, a.googleEventId).catch(calErr);
  await db.update(appointments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(appointments.id, id));
  await addActivity({ workspaceId: ctx.workspaceId, contactId: a.contactId, opportunityId: a.opportunityId, actorId: ctx.userId, type: "appointment", summary: `Appointment cancelled: ${a.title}`, data: { appointmentId: id } });
  await publish(ctx.workspaceId, { type: "appointment.updated", appointmentId: id });
}

export async function upcoming(ctx: Ctx, mineOnly: boolean) {
  ctx.require("crm.view", "view appointments");
  return db.select({ id: appointments.id, title: appointments.title, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone,
    status: appointments.status, userName: users.name, userId: appointments.userId, contactId: contacts.id, contactFirst: contacts.firstName, contactLast: contacts.lastName })
    .from(appointments).innerJoin(contacts, eq(contacts.id, appointments.contactId)).innerJoin(users, eq(users.id, appointments.userId))
    .where(and(eq(appointments.workspaceId, ctx.workspaceId), gte(appointments.endsAt, new Date(Date.now() - 3600_000)), eq(appointments.status, "scheduled"),
      mineOnly || !ctx.can("crm.view_all") ? eq(appointments.userId, ctx.userId) : undefined))
    .orderBy(asc(appointments.startsAt)).limit(200);
}

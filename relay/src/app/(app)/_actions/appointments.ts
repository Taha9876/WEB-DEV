"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { book, cancel, checkConflicts, localToInstant, reschedule } from "@/server/domain/appointments";
import { disconnectCalendar } from "@/server/integrations/google";

const id = z.string().uuid();
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");
const duration = z.coerce.number().int().min(10).max(480);

export async function bookAction(input: unknown) {
  return run(async () => {
    const d = z.object({ contactId: id, opportunityId: id.optional().or(z.literal("")), userId: id, title: z.string().trim().min(1, "Add a title").max(120),
      local, durationMin: duration, timezone: z.string().min(1).max(60), force: z.boolean().optional() }).parse(input);
    const a = await book(await requireCtx(), { ...d, opportunityId: d.opportunityId || null });
    revalidatePath(`/contacts/${d.contactId}`);
    return { id: a.id };
  });
}

export async function previewBusyAction(userId: string, l: string, durationMin: number, timezone: string) {
  return run(async () => {
    const start = localToInstant(local.parse(l), timezone);
    const r = await checkConflicts(await requireCtx(), id.parse(userId), start, new Date(start.getTime() + duration.parse(durationMin) * 60_000));
    return { overlaps: r.overlaps.map((o) => ({ start: o.start.toISOString(), end: o.end.toISOString() })), busy: r.busy.map((o) => ({ start: o.start.toISOString(), end: o.end.toISOString() })) };
  });
}

export async function rescheduleAction(appointmentId: string, l: string, durationMin: number) {
  return run(async () => { await reschedule(await requireCtx(), id.parse(appointmentId), local.parse(l), duration.parse(durationMin)); revalidatePath("/appointments"); });
}

export async function cancelAppointmentAction(appointmentId: string) {
  return run(async () => { await cancel(await requireCtx(), id.parse(appointmentId)); revalidatePath("/appointments"); });
}

export async function disconnectCalendarAction() {
  return run(async () => { const ctx = await requireCtx(); await disconnectCalendar(ctx.workspaceId, ctx.userId, ctx.userId); revalidatePath("/settings/profile"); });
}

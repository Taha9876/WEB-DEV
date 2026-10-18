"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { db, schema } from "@/server/db";
import { acknowledge, createLead, reassign } from "@/server/domain/leads";
import { getLead } from "@/server/domain/leads-read";
import { invalid } from "@/server/errors";
import { normalizePhone } from "@/lib/phone";

const uuid = z.string().uuid();

export async function acknowledgeAction(leadId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    await getLead(ctx, uuid.parse(leadId)); // visibility check
    await acknowledge(ctx.workspaceId, leadId, ctx.userId);
    revalidatePath("/leads");
  });
}

export async function reassignAction(leadId: string, toUserId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    ctx.require("leads.manage", "reassign leads");
    await reassign(ctx.workspaceId, uuid.parse(leadId), uuid.parse(toUserId), ctx.userId);
    revalidatePath("/leads");
  });
}

const manualSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional(),
});

/** F3.1 — manual entry. Matches an existing contact by phone or email before creating one. */
export async function createManualLeadAction(input: z.input<typeof manualSchema>) {
  return run(async () => {
    const ctx = await requireCtx();
    ctx.require("crm.create", "create leads");
    const p = manualSchema.safeParse(input);
    if (!p.success) throw invalid("Please fix the highlighted fields.", Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
    const phone = p.data.phone ? normalizePhone(p.data.phone) : null;
    if (p.data.phone && !phone) throw invalid("Please fix the highlighted fields.", { phone: "Use international format, e.g. +923001234567" });

    const lead = await db.transaction(async (tx) => {
      let contact = phone
        ? (await tx.select().from(schema.contacts).where(and(eq(schema.contacts.workspaceId, ctx.workspaceId), eq(schema.contacts.phone, phone))))[0]
        : p.data.email
          ? (await tx.select().from(schema.contacts).where(and(eq(schema.contacts.workspaceId, ctx.workspaceId), eq(schema.contacts.email, p.data.email))))[0]
          : undefined;
      contact ??= (await tx.insert(schema.contacts).values({
        workspaceId: ctx.workspaceId, firstName: p.data.firstName, lastName: p.data.lastName || null, phone, email: p.data.email || null,
      }).returning())[0];
      return createLead({ workspaceId: ctx.workspaceId, contactId: contact.id, source: "manual", message: p.data.message || null, actorId: ctx.userId }, tx);
    });
    revalidatePath("/leads");
    return { id: lead.id };
  });
}

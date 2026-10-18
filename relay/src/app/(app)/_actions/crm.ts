"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import * as crm from "@/server/domain/crm";
import { invalid } from "@/server/errors";
import { normalizePhone } from "@/lib/phone";

const id = z.string().uuid();
const custom = z.record(z.string(), z.unknown()).optional();
const filters = z.array(z.object({ field: z.string().max(60), value: z.string().max(200) })).max(20);

const parse = <T>(schema: z.ZodType<T>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success) throw invalid("Please fix the highlighted fields.", Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
  return r.data;
};
const phone = (p?: string | null) => {
  if (!p) return null;
  const n = normalizePhone(p);
  if (!n) throw invalid("Please fix the highlighted fields.", { phone: "Use international format, e.g. +923001234567" });
  return n;
};

const contactInput = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  companyId: id.optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  custom,
});

export async function createContactAction(input: unknown) {
  return run(async () => {
    const d = parse(contactInput, input);
    const c = await crm.createContact(await requireCtx(), { ...d, phone: phone(d.phone), companyId: d.companyId || null });
    revalidatePath("/contacts");
    return { id: c.id };
  });
}

export async function updateContactAction(contactId: string, version: number, input: unknown) {
  return run(async () => {
    const d = parse(contactInput.partial().extend({ optedOut: z.boolean().optional() }), input);
    await crm.updateContact(await requireCtx(), id.parse(contactId), z.number().int().parse(version), {
      ...d, phone: d.phone !== undefined ? phone(d.phone) : undefined, companyId: d.companyId === "" ? null : d.companyId,
      lastName: d.lastName === undefined ? undefined : d.lastName || null, email: d.email === undefined ? undefined : d.email || null,
    });
    revalidatePath(`/contacts/${contactId}`);
  });
}

export async function deleteContactAction(contactId: string) {
  return run(async () => { await crm.deleteContact(await requireCtx(), id.parse(contactId)); revalidatePath("/contacts"); });
}

export async function addNoteAction(contactId: string, body: string, opportunityId?: string) {
  return run(async () => {
    const text = z.string().trim().min(1, "Write something first").max(4000).parse(body);
    await crm.addNote(await requireCtx(), id.parse(contactId), text, opportunityId ? id.parse(opportunityId) : null);
    revalidatePath(`/contacts/${contactId}`);
  });
}

export async function createCompanyAction(name: string, domain?: string) {
  return run(async () => {
    const c = await crm.createCompany(await requireCtx(), z.string().trim().min(1).max(120).parse(name), domain);
    return { id: c.id, name: c.name };
  });
}

const oppInput = z.object({
  contactId: id, pipelineId: id, stageId: id.optional(),
  title: z.string().trim().min(1, "Give the opportunity a title").max(160),
  value: z.coerce.number().min(0, "Value can't be negative").max(1e10).optional(),
  currency: z.string().length(3).optional(),
  custom,
});

export async function createOpportunityAction(input: unknown) {
  return run(async () => {
    const d = parse(oppInput, input);
    const o = await crm.createOpportunity(await requireCtx(), { ...d, valueCents: d.value !== undefined ? Math.round(d.value * 100) : undefined });
    revalidatePath("/pipeline"); revalidatePath(`/contacts/${d.contactId}`);
    return { id: o.id };
  });
}

export async function updateOpportunityAction(oppId: string, version: number, input: unknown) {
  return run(async () => {
    const d = parse(z.object({ title: z.string().trim().min(1).max(160).optional(), value: z.coerce.number().min(0).max(1e10).optional(),
      currency: z.string().length(3).optional(), ownerId: id.optional(), custom }), input);
    const o = await crm.updateOpportunity(await requireCtx(), id.parse(oppId), version, { ...d, valueCents: d.value !== undefined ? Math.round(d.value * 100) : undefined });
    revalidatePath("/pipeline");
    return { version: o.version };
  });
}

export async function moveOpportunityAction(oppId: string, stageId: string, version: number) {
  return run(async () => {
    const o = await crm.moveOpportunity(await requireCtx(), id.parse(oppId), id.parse(stageId), z.number().int().parse(version));
    return { version: o.version };
  });
}

export async function deleteOpportunityAction(oppId: string) {
  return run(async () => { await crm.deleteOpportunity(await requireCtx(), id.parse(oppId)); revalidatePath("/pipeline"); });
}

export async function saveListAction(name: string, entity: "contacts" | "opportunities", f: unknown) {
  return run(async () => {
    const l = await crm.saveList(await requireCtx(), z.string().trim().min(1, "Name the list").max(60).parse(name), z.enum(["contacts", "opportunities"]).parse(entity), filters.parse(f));
    revalidatePath("/contacts");
    return { id: l.id };
  });
}

export async function deleteSavedListAction(listId: string) {
  return run(async () => { await crm.deleteSavedList(await requireCtx(), id.parse(listId)); revalidatePath("/contacts"); });
}

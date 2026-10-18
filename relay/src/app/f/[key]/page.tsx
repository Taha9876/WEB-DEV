import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { createLead } from "@/server/domain/leads";
import { lockedFor, recordFailure } from "@/server/auth/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { PublicForm, type FormState } from "@/components/leads/public-form";

export const dynamic = "force-dynamic";

async function workspaceFor(key: string) {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const [r] = await db.select({ id: schema.workspaces.id, name: schema.workspaces.name }).from(schema.leadSettings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.leadSettings.workspaceId)).where(eq(schema.leadSettings.webFormKey, key));
  return r ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const ws = await workspaceFor((await params).key);
  return { title: ws ? `Contact ${ws.name}` : "Form not found" };
}

/** F3.1 — public lead capture. Untrusted input: validated, rate-limited per IP, honeypot for bots (Q3). */
export default async function WebFormPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ws = await workspaceFor(key);
  if (!ws) notFound();

  async function submit(_: FormState, form: FormData): Promise<FormState> {
    "use server";
    const target = await workspaceFor(key);
    if (!target) return { error: "This form is no longer available." };
    if (String(form.get("website") ?? "")) return { done: true }; // honeypot: pretend success
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const rk = [`form:${key}:${ip}`];
    if (await lockedFor(rk)) return { error: "Too many submissions from your network. Please try again in a few minutes." };
    const p = z.object({
      name: z.string().trim().min(2, "Please enter your name").max(80),
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
      message: z.string().trim().min(3, "Tell us a little about what you need").max(2000),
    }).safeParse(Object.fromEntries(form));
    const values = { name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), message: String(form.get("message") ?? "") };
    if (!p.success) return { fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])), values };
    const phone = p.data.phone ? normalizePhone(p.data.phone) : null;
    if (p.data.phone && !phone) return { fieldErrors: { phone: "Include your country code, e.g. +92 300 1234567" }, values };
    if (!phone && !p.data.email) return { fieldErrors: { phone: "Give us a phone number or an email so we can reply" }, values };
    await recordFailure(rk); // counts submissions; 5 per 15 minutes per IP
    await db.transaction(async (tx) => {
      const [first, ...rest] = p.data.name.split(/\s+/);
      let [c] = phone ? await tx.select().from(schema.contacts).where(and(eq(schema.contacts.workspaceId, target.id), eq(schema.contacts.phone, phone)))
        : await tx.select().from(schema.contacts).where(and(eq(schema.contacts.workspaceId, target.id), eq(schema.contacts.email, p.data.email!)));
      c ??= (await tx.insert(schema.contacts).values({ workspaceId: target.id, firstName: first, lastName: rest.join(" ") || null, phone, email: p.data.email || null, tags: ["web"] }).returning())[0];
      await createLead({ workspaceId: target.id, contactId: c.id, source: "web_form", message: p.data.message }, tx);
    });
    return { done: true };
  }

  return <PublicForm company={ws.name} action={submit} />;
}

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { createSession, destroySession } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { clearFailures, lockedFor, recordFailure } from "@/server/auth/rate-limit";
import { createWorkspace } from "@/server/domain/workspace";

export type AuthState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | undefined;

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const signupSchema = z.object({
  workspaceName: z.string().trim().min(2, "Company name is too short").max(60),
  name: z.string().trim().min(2, "Enter your name").max(80),
  email,
  password: z.string().min(10, "Use at least 10 characters").max(200),
  timezone: z.string().max(60).optional(),
});

const fieldErrors = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message]));

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(form) as Record<string, string>;
  const parsed = signupSchema.safeParse(raw);
  const values = { workspaceName: raw.workspaceName ?? "", name: raw.name ?? "", email: raw.email ?? "" };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const exists = await db.query.users.findFirst({ where: eq(schema.users.email, parsed.data.email), columns: { id: true } });
  if (exists) return { fieldErrors: { email: "An account with this email already exists — sign in instead." }, values };
  const { owner } = await createWorkspace(parsed.data);
  await createSession(owner.id);
  redirect("/dashboard");
}

// Hash of a random string: verifying against it keeps timing equal for unknown emails (no user enumeration).
let dummyHash: Promise<string> | undefined;

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password") }).safeParse(Object.fromEntries(form));
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const keys = [`email:${parsed.data.email}`, `ip:${ip}`];

  const wait = await lockedFor(keys);
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, values };

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, parsed.data.email) });
  const ok = user && !user.deactivatedAt
    ? await verifyPassword(user.passwordHash, parsed.data.password)
    : (await verifyPassword(await (dummyHash ??= hashPassword("not-a-real-password")), parsed.data.password), false);
  if (!ok || !user) {
    await recordFailure(keys);
    return { error: "Email or password is incorrect.", values };
  }
  await clearFailures(keys);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

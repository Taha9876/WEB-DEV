import { redirect } from "next/navigation";
import { z } from "zod";
import { lookupInvite, acceptInvite } from "@/server/domain/admin";
import { createSession } from "@/server/auth/session";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/landing/landing";
import type { AuthState } from "@/app/(auth)/actions";

export const metadata = { title: "Join workspace" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await lookupInvite(token);

  async function accept(_: AuthState, form: FormData): Promise<AuthState> {
    "use server";
    const p = z.object({ name: z.string().trim().min(2, "Enter your name").max(80), password: z.string().min(10, "Use at least 10 characters").max(200), timezone: z.string().max(60) })
      .safeParse(Object.fromEntries(form));
    if (!p.success) return { fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])), values: { name: String(form.get("name") ?? "") } };
    try {
      const u = await acceptInvite(token, p.data.name, p.data.password, p.data.timezone || "UTC");
      await createSession(u.id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't accept the invitation." };
    }
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 size-8" />
        {inv ? (
          <>
            <p className="mb-2 text-sm text-muted-foreground">You&apos;re invited to <b className="text-foreground">{inv.ws}</b> as {inv.inv.email}</p>
            <AuthForm mode="signup" action={accept} fields={[
              { name: "name", label: "Your name", autoComplete: "name" },
              { name: "password", label: "Choose a password", type: "password", autoComplete: "new-password", placeholder: "At least 10 characters" },
            ]} />
          </>
        ) : <><h1 className="font-display text-4xl">Invitation expired</h1><p className="mt-3 text-muted-foreground">This link is invalid, already used, or older than 7 days. Ask your admin for a new one.</p></>}
      </div>
    </main>
  );
}

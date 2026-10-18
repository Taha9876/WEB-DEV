import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { Logo } from "@/components/landing/landing";
import { AuthVisual } from "@/components/auth/auth-visual";
import { ThemeToggle } from "@/components/theme";
import { Aurora } from "@/components/aurora";
import { Smoke } from "@/components/smoke";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCtx()) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <Aurora intensity={0.7} />
      <Smoke />
      <div className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between"><Link href="/" className="flex w-fit items-center gap-2.5 font-semibold tracking-tight"><Logo /> Relay</Link><ThemeToggle /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-xs text-muted-foreground">Protected by Argon2id hashing, rate-limited sign-in and HTTP-only sessions.</p>
      </div>
      <AuthVisual />
    </main>
  );
}

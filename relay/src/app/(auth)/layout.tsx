import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { Logo } from "@/components/landing/landing";
import { AuthVisual } from "@/components/auth/auth-visual";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCtx()) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="relative flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="flex w-fit items-center gap-2.5 font-medium tracking-tight"><Logo /> Relay</Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-xs text-muted-foreground">Protected by Argon2id hashing, rate-limited sign-in and HTTP-only sessions.</p>
      </div>
      <AuthVisual />
    </main>
  );
}

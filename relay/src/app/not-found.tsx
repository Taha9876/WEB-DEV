import Link from "next/link";
import { Logo } from "@/components/landing/shared";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto size-10" />
        <h1 className="mt-6 font-display text-5xl">Not <em>found</em></h1>
        <p className="mt-3 text-muted-foreground">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/" className="mt-8 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Back to Relay</Link>
      </div>
    </main>
  );
}

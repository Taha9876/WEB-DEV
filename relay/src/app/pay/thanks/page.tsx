import { Logo } from "@/components/landing/landing";

export const metadata = { title: "Payment received" };

export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto size-10" />
        <h1 className="mt-6 font-display text-4xl">Payment received</h1>
        <p className="mt-3 text-muted-foreground">Thank you — your payment went through. You can close this page.</p>
      </div>
    </main>
  );
}

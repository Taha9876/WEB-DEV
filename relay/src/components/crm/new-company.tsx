"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { createCompanyAction } from "@/app/(app)/_actions/crm";

export function NewCompany() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const add = () => {
    const name = prompt("Company name");
    if (!name) return;
    const domain = prompt("Website domain (optional)") ?? undefined;
    start(async () => { const r = await createCompanyAction(name, domain || undefined); r.ok ? (toast.success("Company created"), router.refresh()) : toast.error(r.error); });
  };
  return (
    <button onClick={add} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-sm font-medium text-signal-foreground disabled:opacity-60">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} New company</button>
  );
}

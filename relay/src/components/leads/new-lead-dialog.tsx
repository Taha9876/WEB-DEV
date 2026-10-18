"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createManualLeadAction } from "@/app/(app)/_actions/leads";

export function NewLeadDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (form: FormData) => start(async () => {
    const res = await createManualLeadAction(Object.fromEntries(form) as Record<string, string> as never);
    if (!res.ok) { setErrors((res.details as Record<string, string>) ?? {}); toast.error(res.error); return; }
    setErrors({}); setOpen(false);
    toast.success("Lead created and assigned");
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal">New lead</DialogTitle>
          <DialogDescription>Matched to an existing contact by phone or email, then assigned round-robin.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <Field name="firstName" label="First name" error={errors.firstName} required />
          <Field name="lastName" label="Last name" error={errors.lastName} />
          <Field name="phone" label="Phone" placeholder="+923001234567" error={errors.phone} />
          <Field name="email" label="Email" type="email" error={errors.email} />
          <div className="sm:col-span-2">
            <label htmlFor="nl-message" className="mb-1.5 block text-sm">What do they need?</label>
            <textarea id="nl-message" name="message" rows={3} className="w-full resize-none rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-signal/60" />
          </div>
          <button disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60 sm:col-span-2">
            {pending && <Loader2 className="size-4 animate-spin" />} {pending ? "Creating…" : "Create & assign"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ name, label, type = "text", placeholder, error, required, defaultValue }: {
  name: string; label: string; type?: string; placeholder?: string; error?: string; required?: boolean; defaultValue?: string;
}) {
  const id = `fld-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm">{label}{required && <span className="text-muted-foreground"> *</span>}</label>
      <input id={id} name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue}
        aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined}
        className="h-10 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-signal/60 aria-invalid:border-destructive/60" />
      {error && <p id={`${id}-e`} className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

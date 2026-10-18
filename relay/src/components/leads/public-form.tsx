"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Loader2 } from "lucide-react";

export type FormState = { done?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | undefined;

export function PublicForm({ company, action }: { company: string; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const input = "h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none transition-colors focus:border-signal/60 aria-invalid:border-destructive/60";
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <main className="grain relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute left-1/2 top-0 size-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/10 blur-[120px]" />
      <div className="relative w-full max-w-md">
        <AnimatePresence mode="wait">
          {state?.done ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="edge rounded-3xl p-8 text-center">
              <CheckCircle2 className="mx-auto size-12 text-ok" />
              <h1 className="mt-5 font-display text-4xl">Thank you</h1>
              <p className="mt-2 text-muted-foreground">Your message reached {company}. A named person on the team now owns it and will reply shortly.</p>
            </motion.div>
          ) : (
            <motion.form key="form" action={formAction} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="edge space-y-4 rounded-3xl p-6 sm:p-8" noValidate>
              <div>
                <p className="text-sm text-muted-foreground">{company}</p>
                <h1 className="mt-1 font-display text-4xl leading-none">How can we <em className="italic">help?</em></h1>
              </div>
              <div className="absolute -left-[9999px]" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              {[["name", "Your name", "text", "name"], ["phone", "Phone (with country code)", "tel", "tel"], ["email", "Email", "email", "email"]].map(([n, l, t, a]) => (
                <div key={n}><label htmlFor={`pf-${n}`} className="mb-1.5 block text-sm">{l}</label>
                  <input id={`pf-${n}`} name={n} type={t} autoComplete={a} defaultValue={state?.values?.[n]} aria-invalid={!!err(n)} aria-describedby={err(n) ? `pf-${n}-e` : undefined} className={input} />
                  {err(n) && <p id={`pf-${n}-e`} className="mt-1 text-xs text-destructive">{err(n)}</p>}</div>
              ))}
              <div><label htmlFor="pf-message" className="mb-1.5 block text-sm">What do you need?</label>
                <textarea id="pf-message" name="message" rows={4} defaultValue={state?.values?.message} aria-invalid={!!err("message")} className={`${input} h-auto resize-none py-2.5`} />
                {err("message") && <p className="mt-1 text-xs text-destructive">{err("message")}</p>}</div>
              {state?.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
              <button disabled={pending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60">
                {pending && <Loader2 className="size-4 animate-spin" />}{pending ? "Sending…" : "Send"}</button>
              <p className="text-center text-[11px] text-muted-foreground">Powered by Relay</p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

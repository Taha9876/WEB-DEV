"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import type { AuthState } from "@/app/(auth)/actions";

type Field = { name: string; label: string; type?: string; autoComplete?: string; placeholder?: string };

export function AuthForm({ mode, action, fields }: {
  mode: "login" | "signup";
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  fields: Field[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="font-display text-5xl leading-none">{mode === "login" ? <>Welcome <em className="italic">back</em></> : <>Start your <em className="italic">workspace</em></>}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {mode === "login" ? "Sign in to see who owns every lead right now." : "You will be the Owner. Invite your team once you are in."}
      </p>

      <form action={formAction} className="mt-10 space-y-5" noValidate>
        <input type="hidden" name="timezone" value={tz} />
        {fields.map((f) => <Input key={f.name} {...f} error={state?.fieldErrors?.[f.name]} defaultValue={state?.values?.[f.name]} />)}

        <AnimatePresence>
          {state?.error && (
            <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{state.error}</motion.p>
          )}
        </AnimatePresence>

        <button disabled={pending} className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-signal text-sm font-medium text-signal-foreground transition-[transform,opacity] active:scale-[0.98] disabled:opacity-70">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? (mode === "login" ? "Signing in…" : "Creating workspace…") : mode === "login" ? "Sign in" : "Create workspace"}
          {!pending && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        {mode === "login"
          ? <>New to Relay? <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">Create a workspace</Link></>
          : <>Already have an account? <Link href="/login" className="text-foreground underline-offset-4 hover:underline">Sign in</Link></>}
      </p>
    </motion.div>
  );
}

function Input({ name, label, type = "text", autoComplete, placeholder, error, defaultValue }: Field & { error?: string; defaultValue?: string }) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm">{label}</label>
      <div className="relative">
        <input id={id} name={name} type={isPw && show ? "text" : type} autoComplete={autoComplete} placeholder={placeholder} defaultValue={defaultValue}
          aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
          className="h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-signal/60 focus:shadow-[0_0_0_4px_oklch(0.91_0.2_125/0.12)] aria-invalid:border-destructive/60" />
        {isPw && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {error && <p id={`${id}-err`} className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

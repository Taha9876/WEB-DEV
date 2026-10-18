"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Copy, GitBranch, Loader2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/app/primitives";
import { updateRulesAction } from "@/app/(app)/_actions/rules";

type Step = { type: "next_eligible" | "backup" | "manager"; seconds: number; userId?: string };
type S = { maxOpenLeads: number; ackWindowSeconds: number; idleSeconds: number; acknowledgedOnAbsence: "keep" | "reassign"; aiFirstResponse: boolean; escalationChain: Step[] };

const LABEL = { next_eligible: "Next available employee (round-robin)", backup: "Designated backup", manager: "Manager (always receives it)" };

export function RulesView({ s, team, ai, formUrl }: { s: S; team: { id: string; name: string }[]; ai: boolean; formUrl: string }) {
  const [v, setV] = useState(s);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof S>(k: K, val: S[K]) => setV((x) => ({ ...x, [k]: val }));
  const setStep = (i: number, p: Partial<Step>) => set("escalationChain", v.escalationChain.map((st, j) => (j === i ? { ...st, ...p } : st)));
  const save = () => start(async () => { const r = await updateRulesAction(v); r.ok ? (toast.success("Rules saved — they apply to the next timer"), router.refresh()) : toast.error(r.error); });
  const total = v.ackWindowSeconds + v.escalationChain.reduce((a, b) => a + b.seconds, 0);
  const num = "h-10 w-28 rounded-xl border border-input bg-background px-3 font-mono text-sm tabular outline-none focus:border-signal/60";

  return (
    <div className="pb-24">
      <PageHeader title={<>Assignment <em>rules</em></>} description="How leads are distributed, how long people have to respond, and who gets it next. Use seconds for a live demo.">
        <button onClick={save} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-signal px-4 text-sm font-medium text-signal-foreground disabled:opacity-60">{pending && <Loader2 className="size-4 animate-spin" />}Save rules</button>
      </PageHeader>

      <div className="grid max-w-6xl gap-6 px-4 pt-6 sm:px-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="edge rounded-3xl p-6" aria-labelledby="dist-h">
            <h2 id="dist-h" className="flex items-center gap-2 font-medium"><Users className="size-5 text-signal" /> Distribution</h2>
            <p className="mt-1 text-sm text-muted-foreground">Round-robin among employees whose status is <b>Available</b> and who are under the open-lead limit. Busy, On leave and Offline people never receive leads.</p>
            <div className="mt-5 flex flex-wrap gap-6">
              <div><label htmlFor="max" className="mb-1.5 block text-sm">Max open leads per employee</label>
                <input id="max" type="number" min={1} value={v.maxOpenLeads} onChange={(e) => set("maxOpenLeads", +e.target.value)} className={num} /></div>
              <div><label htmlFor="ack" className="mb-1.5 block text-sm">Acknowledgement window (seconds)</label>
                <input id="ack" type="number" min={5} value={v.ackWindowSeconds} onChange={(e) => set("ackWindowSeconds", +e.target.value)} className={num} /></div>
              <div><label htmlFor="idle" className="mb-1.5 block text-sm">Idle period for recovery (seconds)</label>
                <input id="idle" type="number" min={5} value={v.idleSeconds} onChange={(e) => set("idleSeconds", +e.target.value)} className={num} /></div>
            </div>
          </section>

          <section className="edge rounded-3xl p-6" aria-labelledby="esc-h">
            <h2 id="esc-h" className="flex items-center gap-2 font-medium"><GitBranch className="size-5 text-signal" /> Escalation chain</h2>
            <p className="mt-1 text-sm text-muted-foreground">When a window expires the lead moves to the next level. A backup who isn&apos;t Available is skipped; the manager is the last resort.</p>
            <ol className="mt-5 space-y-2">
              <li className="flex items-center gap-3 rounded-2xl bg-background/60 p-3 text-sm">
                <span className="grid size-7 place-items-center rounded-full bg-signal text-xs font-medium text-signal-foreground">0</span>
                <span className="flex-1">Assigned owner</span><span className="font-mono text-xs text-muted-foreground">{v.ackWindowSeconds}s</span>
              </li>
              <AnimatePresence initial={false}>
                {v.escalationChain.map((st, i) => (
                  <motion.li key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap items-center gap-2 rounded-2xl bg-background/60 p-3 text-sm">
                    <span className="grid size-7 place-items-center rounded-full bg-ember/20 text-xs font-medium text-ember">{i + 1}</span>
                    <select aria-label={`Level ${i + 1} target`} value={st.type} onChange={(e) => setStep(i, { type: e.target.value as Step["type"], userId: e.target.value === "next_eligible" ? undefined : st.userId })}
                      className="h-9 rounded-lg border border-input bg-surface px-2 text-sm">{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    {st.type !== "next_eligible" && (
                      <select aria-label={`Level ${i + 1} person`} value={st.userId ?? ""} onChange={(e) => setStep(i, { userId: e.target.value || undefined })} className="h-9 rounded-lg border border-input bg-surface px-2 text-sm">
                        <option value="">Choose…</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                    )}
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">for
                      <input type="number" min={5} value={st.seconds} onChange={(e) => setStep(i, { seconds: +e.target.value })} aria-label={`Level ${i + 1} seconds`} className="h-9 w-20 rounded-lg border border-input bg-surface px-2 font-mono text-sm" />s</label>
                    <button aria-label={`Remove level ${i + 1}`} onClick={() => set("escalationChain", v.escalationChain.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            {v.escalationChain.length < 6 && (
              <button onClick={() => set("escalationChain", [...v.escalationChain, { type: "next_eligible", seconds: 60 }])} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-input px-3 text-sm text-muted-foreground hover:text-foreground"><Plus className="size-4" /> Add level</button>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Worst case, a lead reaches the last level after <b className="font-mono">{total}s</b>. Every escalation sends a Telegram alert to the new owner.</p>
          </section>

          <section className="edge rounded-3xl p-6" aria-labelledby="abs-h">
            <h2 id="abs-h" className="font-medium">When someone goes On leave or Offline</h2>
            <p className="mt-1 text-sm text-muted-foreground">Their <b>unacknowledged</b> leads are always reassigned immediately. For leads they already acknowledged:</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Acknowledged leads on absence">
              {([["keep", "Keep with them", "They stay accountable; the lead shows in recovery if it goes idle."], ["reassign", "Reassign them too", "Every open lead moves to someone available right away."]] as const).map(([k, t, d]) => (
                <button key={k} role="radio" aria-checked={v.acknowledgedOnAbsence === k} onClick={() => set("acknowledgedOnAbsence", k)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${v.acknowledgedOnAbsence === k ? "border-signal/50 bg-signal/[0.06]" : "border-hairline hover:border-border"}`}>
                  <p className="text-sm font-medium">{t}</p><p className="mt-1 text-xs text-muted-foreground">{d}</p></button>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-signal/20 bg-signal/[0.04] p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-signal" /> AI first response</h2>
            <p className="mt-2 text-xs text-muted-foreground">On a lead&apos;s first escalation, if nobody has written to the customer yet, Relay sends a short, clearly automated WhatsApp acknowledgement in their language. The human owner still owns the lead.</p>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span>{ai ? "Enabled" : "Needs ANTHROPIC_API_KEY on the server"}</span>
              <input type="checkbox" checked={v.aiFirstResponse} onChange={(e) => set("aiFirstResponse", e.target.checked)} className="size-5 accent-[var(--signal)]" />
            </label>
          </section>
          <section className="edge rounded-3xl p-5">
            <h2 className="text-sm font-medium">Public web form</h2>
            <p className="mt-1 text-xs text-muted-foreground">Share or embed this link. Submissions become leads labelled “Web form” and are assigned instantly.</p>
            <button onClick={() => { navigator.clipboard.writeText(formUrl); toast.success("Copied"); }} className="mt-3 flex w-full items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-left font-mono text-[11px] hover:bg-accent">
              <span className="flex-1 truncate">{formUrl}</span><Copy className="size-3.5" /></button>
            <a href={formUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Open form</a>
          </section>
        </aside>
      </div>
    </div>
  );
}

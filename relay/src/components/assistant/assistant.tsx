"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { ArrowUp, Check, Copy, Eraser, Sparkles, X } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean };

const KEY = "relay-assistant";
const QUICK = [
  { l: "Daily summary", p: "Give me today's summary report: new leads, response times, escalations, recovery queue, payments and appointments." },
  { l: "What needs attention?", p: "What needs my attention right now? List the most urgent leads and customers with reasons." },
  { l: "Team status", p: "Summarize the team's status: who is available, who is overloaded, who is on leave, and open leads per person." },
  { l: "Pipeline report", p: "Write a pipeline report by stage with counts and values, and the biggest open deals." },
  { l: "Escalations (24h)", p: "Which leads escalated in the last 24 hours, to whom, and why?" },
  { l: "Payments", p: "Summarize payments: collected this month, pending links, failures and refunds." },
];
const TOOL_LABEL: Record<string, string> = {
  workspace_overview: "dashboard", list_leads: "leads", recovery_queue: "recovery queue", find_contacts: "contacts", contact_details: "customer record",
  pipeline_summary: "pipeline", team_status: "team", upcoming_appointments: "appointments", payments_summary: "payments", recent_audit: "audit log", integration_status: "integrations",
};
const THINKING = ["Reading your workspace…", "Checking leads and timers…", "Looking at the pipeline…", "Putting it together…"];

/** Open the assistant from anywhere: window.dispatchEvent(new CustomEvent("relay:ask", { detail: "prompt" })) */
export const askRelay = (prompt: string) => window.dispatchEvent(new CustomEvent("relay:ask", { detail: prompt }));

export function Assistant({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch {} }, [msgs]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs.length, busy]);
  useEffect(() => { if (!busy) return; const t = setInterval(() => setPhase((p) => (p + 1) % THINKING.length), 1600); return () => clearInterval(t); }, [busy]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 150); }, [open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgsRef.current, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true); setPhase(0); setOpen(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }) });
      const j = await res.json();
      setMsgs((m) => [...m, res.ok ? { role: "assistant", content: j.reply, tools: j.tools } : { role: "assistant", content: j.error ?? "Something went wrong.", error: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Couldn't reach the server. Check your connection.", error: true }]);
    } finally { setBusy(false); }
  };

  // Keyboard shortcut + "ask from anywhere" event.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); };
    const ask = (e: Event) => { setOpen(true); send(String((e as CustomEvent).detail ?? "")); };
    addEventListener("keydown", key); addEventListener("relay:ask", ask);
    return () => { removeEventListener("keydown", key); removeEventListener("relay:ask", ask); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }} onClick={() => setOpen(true)} aria-label="Open Relay Assistant"
            className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full p-[1.5px] shadow-[0_18px_40px_-12px_color-mix(in_oklch,var(--signal)_55%,transparent)]">
            <span aria-hidden className="absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,var(--signal),var(--accent-text),transparent_40%,var(--signal))]" />
            <span className="relative flex items-center gap-2 rounded-full bg-background/90 px-4 py-2.5 text-sm font-medium backdrop-blur-xl">
              <Sparkles className="size-4 text-signal transition-transform group-hover:rotate-12" /> Ask Relay
              <kbd className="hidden rounded-md border border-hairline px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">Ctrl K</kbd>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section role="dialog" aria-label="Relay Assistant" initial={{ opacity: 0, y: 24, scale: 0.96, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 24, scale: 0.96, filter: "blur(6px)" }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="edge fixed bottom-3 right-3 z-50 flex h-[min(700px,calc(100dvh-1.5rem))] w-[min(460px,calc(100vw-1.5rem))] origin-bottom-right flex-col overflow-hidden rounded-[28px] !bg-background/80 backdrop-blur-2xl sm:bottom-5 sm:right-5">
            <header className="flex items-center gap-3 border-b border-hairline px-5 py-4">
              <span className="relative grid size-9 place-items-center rounded-xl bg-signal/15"><Sparkles className="size-4 text-signal" />
                {busy && <span className="absolute inset-0 animate-ping rounded-xl bg-signal/20" />}</span>
              <div className="flex-1"><p className="font-semibold tracking-tight">Relay Assistant</p><p className="text-[11px] text-muted-foreground">Live workspace data · Groq · respects your permissions</p></div>
              {msgs.length > 0 && <button onClick={() => setMsgs([])} aria-label="Clear conversation" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><Eraser className="size-4" /></button>}
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
              {msgs.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <p className="font-display text-3xl leading-tight">Hi {firstName}, <em>what do you need?</em></p>
                  <p className="mt-2 text-sm text-muted-foreground">Ask about leads, customers, the pipeline, your team, payments or appointments — or pick a report.</p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {QUICK.map((q, i) => (
                      <motion.button key={q.l} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.04 }} onClick={() => send(q.p)}
                        className="rounded-2xl border border-hairline bg-background/60 px-3 py-2.5 text-left text-sm transition-colors hover:border-signal/40 hover:bg-signal/5">{q.l}</motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
              {msgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-signal px-3.5 py-2 text-sm text-signal-foreground">{m.content}</p>
                  ) : (
                    <div className={`group relative rounded-2xl rounded-bl-md border px-4 py-3 text-sm ${m.error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-hairline bg-background/60"}`}>
                      <div className="assistant-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          a: ({ href, children }) => <a href={href} onClick={(e) => { if (href?.startsWith("/")) { e.preventDefault(); router.push(href); } }} className="font-medium text-accent-text underline underline-offset-2">{children}</a>,
                        }}>{m.content}</ReactMarkdown>
                      </div>
                      {!m.error && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2">
                          {(m.tools ?? []).map((t) => <span key={t} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground">{TOOL_LABEL[t] ?? t}</span>)}
                          <CopyButton text={m.content} />
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
              {busy && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex gap-1">{[0, 1, 2].map((d) => <motion.span key={d} className="size-1.5 rounded-full bg-signal" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />)}</span>
                  <AnimatePresence mode="wait"><motion.span key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{THINKING[phase]}</motion.span></AnimatePresence>
                </div>
              )}
              <div ref={end} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-hairline p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-input bg-background/70 p-1.5 focus-within:border-signal/60">
                <label htmlFor="assistant-input" className="sr-only">Ask Relay</label>
                <textarea id="assistant-input" ref={field} value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Ask about leads, customers, reports…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/70 [field-sizing:content]" />
                <button disabled={busy || !input.trim()} aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-xl bg-signal text-signal-foreground transition-transform active:scale-95 disabled:opacity-40"><ArrowUp className="size-4" /></button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">AI can make mistakes — numbers come from live tools, but check before acting.</p>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); toast.success("Copied"); setTimeout(() => setDone(false), 1500); }}
      aria-label="Copy answer" className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100">
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

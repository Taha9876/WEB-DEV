"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AlertCircle, Check, CheckCheck, Clock, Info, Loader2, MessageCircle, MessageCircleOff, RotateCw, SendHorizonal, Sparkles } from "lucide-react";
import { sendMessageAction, retryMessageAction } from "@/app/(app)/_actions/messaging";
import { draftReplyAction } from "@/app/(app)/_actions/ai";
import { dateTime } from "@/lib/format";

type Msg = { id: string; direction: "inbound" | "outbound"; body: string; status: string; errorMessage: string | null; errorCode: string | null; createdAt: string };
type Conv = { id: string; channel: string; messages: Msg[] };

const TICK: Record<string, { icon: React.ElementType; label: string; cls?: string }> = {
  queued: { icon: Clock, label: "Queued" }, sending: { icon: Loader2, label: "Sending", cls: "animate-spin" }, sent: { icon: Check, label: "Sent" },
  delivered: { icon: CheckCheck, label: "Delivered" }, read: { icon: CheckCheck, label: "Read", cls: "text-signal" },
};

/** One WhatsApp thread with delivery states, failure reasons + retry, opt-out guard and AI drafting (I1.3–I1.9). */
export function ConversationPanel({ contactId, optedOut, hasPhone, conversations, compact }: { contactId: string; optedOut: boolean; hasPhone: boolean; conversations: Conv[]; compact?: boolean }) {
  const msgs = conversations.flatMap((c) => c.messages).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [text, setText] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [pending, start] = useTransition();
  const [drafting, startDraft] = useTransition();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  const send = () => start(async () => {
    const r = await sendMessageAction(contactId, text, aiUsed);
    if (!r.ok) { toast.error(r.error); return; }
    setText(""); setAiUsed(false); router.refresh();
  });
  const retry = (id: string) => start(async () => { const r = await retryMessageAction(id); r.ok ? (toast.success("Retrying…"), router.refresh()) : toast.error(r.error); });
  const draft = () => startDraft(async () => {
    const r = await draftReplyAction(contactId);
    if (!r.ok) { toast.error(r.error); return; }
    setText((r.data as { text: string }).text); setAiUsed(true);
  });
  const blocked = optedOut ? "This contact opted out (sent STOP). You can't message them until they message you again." : !hasPhone ? "Add a phone number to this contact to start a WhatsApp conversation." : null;

  return (
    <section className="edge flex flex-col overflow-hidden rounded-2xl" aria-label="WhatsApp conversation">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="size-4 text-muted-foreground" /> WhatsApp</h2>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Twilio sandbox only delivers to phones that joined it by sending the join phrase.">
          <Info className="size-3" /> Sandbox: only phones that joined can receive</span>
      </header>
      <div className={`space-y-2 overflow-y-auto px-4 py-4 ${compact ? "h-[calc(100dvh-18rem)]" : "max-h-[26rem] min-h-40"}`} aria-live="polite">
        {!msgs.length && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>}
        <AnimatePresence initial={false}>
          {msgs.map((m) => {
            const out = m.direction === "outbound";
            const failed = m.status === "failed" || m.status === "undelivered";
            const t = TICK[m.status];
            return (
              <motion.div key={m.id} layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${out ? (failed ? "rounded-br-md border border-destructive/40 bg-destructive/10" : "rounded-br-md bg-signal/15") : "rounded-bl-md bg-surface"}`}>{m.body}</div>
                <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                  <time dateTime={m.createdAt}>{dateTime(m.createdAt)}</time>
                  {out && !failed && t && <span className="flex items-center gap-0.5"><t.icon className={`size-3 ${t.cls ?? ""}`} aria-hidden />{t.label}</span>}
                  {out && m.status === "queued" && m.errorMessage && <span className="text-warn">{m.errorMessage}</span>}
                </div>
                {failed && (
                  <div role="alert" className="mt-1 flex max-w-[85%] items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-px size-3.5 shrink-0" />
                    <span className="flex-1">Not delivered{m.errorCode ? ` (code ${m.errorCode})` : ""}: {m.errorMessage ?? "unknown reason"}</span>
                    {!optedOut && <button onClick={() => retry(m.id)} disabled={pending} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"><RotateCw className="size-3" /> Retry</button>}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={end} />
      </div>
      {blocked ? (
        <p role="status" className="flex items-center gap-2 border-t border-hairline bg-surface/60 px-4 py-3 text-sm text-muted-foreground"><MessageCircleOff className="size-4 shrink-0" /> {blocked}</p>
      ) : (
        <div className="border-t border-hairline p-3">
          <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 focus-within:border-signal/60">
            <label htmlFor={`compose-${contactId}`} className="sr-only">Reply on WhatsApp</label>
            <textarea id={`compose-${contactId}`} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setAiUsed(false); }} rows={1} placeholder="Reply on WhatsApp…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); send(); } }}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/60 [field-sizing:content]" />
            <button onClick={draft} disabled={drafting} aria-label="Draft a reply with AI" title="Draft with AI"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-signal disabled:opacity-50">
              {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}</button>
            <button onClick={send} disabled={pending || !text.trim()} aria-label="Send"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-signal text-signal-foreground transition-transform active:scale-95 disabled:opacity-40">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}</button>
          </div>
          {aiUsed && <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground"><Sparkles className="size-3 text-signal" /> AI draft — review before sending.</p>}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Mail, Send, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app/primitives";
import { saveScheduleAction, sendReportNowAction } from "@/app/(app)/_actions/reports";
import { relative } from "@/lib/format";

type Sched = { recipients: string; hour: number; timezone: string; enabled: boolean; lastSentAt: string | null };
type Hist = { at: string; result: string; error: string | null; to: string; previewUrl: string | null };

export function ReportsView({ me, mode, canSchedule, schedule, history }: { me: { email: string; timezone: string }; mode: string; canSchedule: boolean; schedule: Sched | null; history: Hist[] }) {
  const [sending, startSend] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const [to, setTo] = useState(me.email);
  const [s, setS] = useState<Sched>(schedule ?? { recipients: me.email, hour: 18, timezone: me.timezone, enabled: true, lastSentAt: null });
  const input = "h-10 w-full rounded-xl border border-input bg-background/70 px-3.5 text-sm outline-none focus:border-signal/60";

  const sendNow = () => startSend(async () => {
    const r = await sendReportNowAction(to);
    if (!r.ok) { toast.error(r.error); return; }
    const url = (r.data as { previewUrl: string | null }).previewUrl;
    toast.success("Report sent", { description: url ? "Test inbox — open the preview to see it." : `Delivered to ${to}`, action: url ? { label: "Preview", onClick: () => window.open(url, "_blank") } : undefined });
    router.refresh();
  });
  const save = () => startSave(async () => {
    const r = await saveScheduleAction(s);
    if (r.ok) { toast.success(s.enabled ? `Daily report scheduled for ${String(s.hour).padStart(2, "0")}:00 ${s.timezone}` : "Daily report paused"); router.refresh(); }
    else toast.error(r.error);
  });

  return (
    <div className="pb-16">
      <PageHeader title={<>Email <em>reports</em></>} description="A daily progress email — the live dashboard numbers, an AI-written summary and the leads at risk — sent now or every day on schedule." />
      <div className="grid max-w-5xl gap-4 px-4 pt-6 sm:px-8 lg:grid-cols-2">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="edge rounded-3xl p-6" aria-labelledby="now-h">
          <h2 id="now-h" className="flex items-center gap-2 font-medium"><Send className="size-5 text-signal" /> Send a report now</h2>
          <p className="mt-1 text-sm text-muted-foreground">Comma-separate up to 10 addresses. The report shows what your role can see.</p>
          <label htmlFor="to" className="mb-1.5 mt-5 block text-sm">Recipients</label>
          <input id="to" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          <button onClick={sendNow} disabled={sending} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-signal px-4 text-sm font-medium text-signal-foreground disabled:opacity-60">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}{sending ? "Writing & sending…" : "Send progress report"}</button>
          <p className="mt-3 text-[11px] text-muted-foreground">Delivery: {mode}{mode.startsWith("test") ? " — add SMTP_HOST/PORT/USER/PASS (e.g. a free Gmail app password) to deliver to real inboxes." : ""}</p>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="edge rounded-3xl p-6" aria-labelledby="sched-h">
          <h2 id="sched-h" className="flex items-center gap-2 font-medium"><CalendarClock className="size-5 text-signal" /> Daily schedule</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sent once a day after the chosen hour. {schedule?.lastSentAt ? `Last sent ${relative(schedule.lastSentAt)}.` : ""}</p>
          {!canSchedule ? <p className="mt-5 text-sm text-muted-foreground">Only people who can manage leads can schedule team reports.</p> : (
            <div className="mt-5 space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-hairline bg-background/50 px-3.5 py-2.5 text-sm">
                Send automatically every day
                <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="size-5 accent-[var(--signal)]" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="hour" className="mb-1.5 block text-sm">Time</label>
                  <select id="hour" value={s.hour} onChange={(e) => setS({ ...s, hour: +e.target.value })} className={input}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div>
                <div><label htmlFor="tz" className="mb-1.5 block text-sm">Time zone</label>
                  <input id="tz" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} className={input} /></div>
              </div>
              <div><label htmlFor="rcpt" className="mb-1.5 block text-sm">Recipients</label>
                <input id="rcpt" value={s.recipients} onChange={(e) => setS({ ...s, recipients: e.target.value })} className={input} /></div>
              <button onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60">
                {saving && <Loader2 className="size-4 animate-spin" />}Save schedule</button>
            </div>
          )}
        </motion.section>

        <section className="edge rounded-3xl p-6 lg:col-span-2" aria-labelledby="hist-h">
          <h2 id="hist-h" className="font-medium">Recent sends</h2>
          {!history.length ? <p className="mt-3 text-sm text-muted-foreground">No reports sent yet.</p> : (
            <ul className="mt-3 divide-y divide-hairline">
              {history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  {h.result === "success" ? <CheckCircle2 className="size-4 text-ok" aria-label="Sent" /> : <XCircle className="size-4 text-destructive" aria-label="Failed" />}
                  <span className="min-w-0 flex-1 truncate">{h.to || "—"}{h.error && <span className="block text-xs text-destructive">{h.error}</span>}</span>
                  <span className="text-xs text-muted-foreground">{relative(h.at)}</span>
                  {h.previewUrl && <a href={h.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-text underline underline-offset-2">Preview <ExternalLink className="size-3" /></a>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowUpRight, Check, Loader2, Sparkles, UserRoundCheck } from "lucide-react";
import { Avatar, CountdownRing, SourceBadge, fmtDuration, useServerClock } from "@/components/app/primitives";
import { StatusDot, type Status } from "@/components/app/status";
import { acknowledgeAction, reassignAction } from "@/app/(app)/_actions/leads";
import { dateTime } from "@/lib/format";

type L = {
  lead: { id: string; status: string; source: "web_form" | "whatsapp" | "sms" | "manual"; message: string | null; ownerId: string | null; ackDeadline: string | null; assignedAt: string | null;
    firstAssignedAt: string | null; firstAcknowledgedAt: string | null; escalationLevel: number; escalationCount: number; exhaustedAt: string | null; createdAt: string;
    ai: { intent: string; urgency: number; language: string; summary: string; tags: string[] } | null };
  contact: { id: string; firstName: string; lastName: string | null; phone: string | null; email: string | null };
  ownerName: string | null;
  history: { id: string; kind: string; level: number; reason: string; assignedAt: string; endedAt: string | null; name: string | null }[];
};
type Step = { type: string; seconds: number; userId?: string };

const KIND: Record<string, string> = { initial: "Assigned", escalation: "Escalated", manual: "Reassigned by manager", absence: "Moved — owner unavailable", recovery: "Picked up from waiting" };

export function LeadDetail({ l, team, me, canManage, serverNow, chain, ackWindow, absencePolicy }: {
  l: L; team: { id: string; name: string; status: Status }[]; me: string; canManage: boolean; serverNow: number; chain: Step[]; ackWindow: number; absencePolicy: string;
}) {
  const now = useServerClock(serverNow);
  const [pending, start] = useTransition();
  const router = useRouter();
  const lead = l.lead;
  const mine = lead.ownerId === me;
  const name = `${l.contact.firstName} ${l.contact.lastName ?? ""}`.trim();
  const ack = () => start(async () => { const r = await acknowledgeAction(lead.id); r.ok ? (toast.success("Acknowledged"), router.refresh()) : toast.error(r.error); });
  const move = (id: string) => start(async () => { const r = await reassignAction(lead.id, id); r.ok ? (toast.success("Reassigned"), router.refresh()) : toast.error(r.error); });
  const response = lead.firstAcknowledgedAt && lead.firstAssignedAt ? new Date(lead.firstAcknowledgedAt).getTime() - new Date(lead.firstAssignedAt).getTime() : null;
  const steps = [{ label: "Owner window", seconds: ackWindow }, ...chain.map((s) => ({ label: s.type === "next_eligible" ? "Next available" : s.type === "backup" ? "Backup" : "Manager", seconds: s.seconds }))];

  return (
    <div className="grid gap-6 px-4 pb-16 pt-4 sm:px-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><SourceBadge source={lead.source} /><span className="text-xs capitalize text-muted-foreground">{lead.status}</span></div>
            <h1 className="mt-2 font-display text-5xl leading-none">{name}</h1>
            <Link href={`/contacts/${l.contact.id}`} className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">Open customer record <ArrowUpRight className="size-3.5" /></Link>
          </div>
          <div className="flex items-center gap-4">
            {lead.status === "assigned" && lead.ackDeadline && lead.assignedAt && <CountdownRing deadline={new Date(lead.ackDeadline).getTime()} start={new Date(lead.assignedAt).getTime()} now={now} size={64} />}
            {mine && lead.status === "assigned" && (
              <button onClick={ack} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-medium text-signal-foreground disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Acknowledge</button>
            )}
          </div>
        </header>

        {lead.message && <blockquote className="edge rounded-2xl p-5 text-lg leading-relaxed">“{lead.message}”</blockquote>}

        {lead.ai && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-signal/20 bg-signal/[0.04] p-5" aria-label="AI triage">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-signal" /> AI triage</h2>
              <span className="text-xs text-muted-foreground">{lead.ai.language}</span>
            </div>
            <p className="mt-2">{lead.ai.summary}</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Urgency</span><span className="font-mono tabular">{lead.ai.urgency}/100</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={lead.ai.urgency} aria-valuemin={0} aria-valuemax={100} aria-label="Urgency">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${lead.ai.urgency}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className={`h-full rounded-full ${lead.ai.urgency >= 75 ? "bg-ember" : "bg-signal"}`} /></div>
              </div>
              <span className="rounded-full border border-hairline px-2.5 py-1 text-xs">{lead.ai.intent}</span>
            </div>
          </motion.section>
        )}

        <section aria-labelledby="chain-h">
          <h2 id="chain-h" className="mb-3 font-display text-3xl">Ownership history</h2>
          <ol className="relative space-y-1">
            <span className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-hairline" aria-hidden />
            {l.history.map((h, i) => (
              <motion.li key={h.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="relative flex items-start gap-3 rounded-xl p-2">
                <span className={`relative z-10 grid size-5 place-items-center rounded-full ring-4 ring-background ${!h.endedAt ? "bg-signal" : h.kind === "escalation" ? "bg-ember" : "bg-muted-foreground/40"}`} />
                <div className="flex-1">
                  <p className="text-sm"><b className="font-medium">{h.name ?? "Removed user"}</b> <span className="text-muted-foreground">· {KIND[h.kind] ?? h.kind}{h.level ? ` (level ${h.level})` : ""}</span></p>
                  <p className="text-xs text-muted-foreground">{h.reason}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{dateTime(h.assignedAt)}{h.endedAt ? ` → ${dateTime(h.endedAt)} (${fmtDuration(new Date(h.endedAt).getTime() - new Date(h.assignedAt).getTime())})` : " → now"}</p>
                </div>
                {!h.endedAt && <span className="rounded-full bg-signal/15 px-2 py-0.5 text-[11px] text-signal">Current owner</span>}
              </motion.li>
            ))}
            {!l.history.length && <p className="text-sm text-muted-foreground">Never assigned — waiting for an available employee.</p>}
          </ol>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="edge rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">Accountable owner</p>
          {l.ownerName ? <p className="mt-2 flex items-center gap-2"><Avatar name={l.ownerName} className="size-8 text-[11px]" />{mine ? "You" : l.ownerName}</p>
            : <p className="mt-2 text-ember">Nobody yet — waiting for an available employee</p>}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Time to first response</dt><dd className="font-mono tabular">{response !== null ? fmtDuration(response) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Escalations</dt><dd className="font-mono tabular">{lead.escalationCount}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd>{dateTime(lead.createdAt)}</dd></div>
          </dl>
          {canManage && lead.status !== "closed" && (
            <div className="mt-4 border-t border-hairline pt-4">
              <label htmlFor="reassign" className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><UserRoundCheck className="size-3.5" /> Reassign</label>
              <select id="reassign" disabled={pending} defaultValue="" onChange={(e) => e.target.value && move(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">
                <option value="" disabled>Choose an employee…</option>
                {team.filter((t) => t.id !== lead.ownerId).map((t) => <option key={t.id} value={t.id} disabled={t.status === "on_leave" || t.status === "offline"}>{t.name} — {t.status.replace("_", " ")}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="edge rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">Escalation path</p>
          <ol className="mt-3 space-y-2">{steps.map((s, i) => {
            const state = i < lead.escalationLevel ? "past" : i === lead.escalationLevel && lead.status === "assigned" && !lead.exhaustedAt ? "now" : "future";
            return (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className={`grid size-6 place-items-center rounded-full text-[10px] ${state === "now" ? "bg-signal text-signal-foreground" : state === "past" ? "bg-ember/20 text-ember" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                <span className="flex-1">{s.label}</span><span className="font-mono text-xs text-muted-foreground">{fmtDuration(s.seconds * 1000)}</span>
              </li>);
          })}</ol>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">If the owner goes On leave or Offline, unacknowledged leads move immediately; acknowledged leads {absencePolicy === "reassign" ? "are also reassigned" : "stay with them"} (workspace policy).</p>
        </div>
        {l.ownerName && <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><StatusDot status={team.find((t) => t.id === lead.ownerId)?.status ?? "available"} /> Owner availability shown live</p>}
      </aside>
    </div>
  );
}

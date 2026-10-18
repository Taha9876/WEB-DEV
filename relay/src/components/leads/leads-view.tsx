"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Loader2, Plus, Repeat2, Zap } from "lucide-react";
import { PageHeader, SourceBadge, CountdownRing, useServerClock, EmptyState, Avatar, fmtDuration } from "@/components/app/primitives";
import { StatusDot, STATUS_LABEL, type Status } from "@/components/app/status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { acknowledgeAction, reassignAction } from "@/app/(app)/_actions/leads";
import { NewLeadDialog } from "./new-lead-dialog";

type Row = {
  id: string; status: "unassigned" | "assigned" | "acknowledged" | "closed"; source: "web_form" | "whatsapp" | "sms" | "manual";
  message: string | null; ownerId: string | null; ownerName: string | null; ownerStatus: Status | null;
  ackDeadline: number | null; assignedAt: number | null; escalationCount: number; exhaustedAt: number | null; createdAt: number;
  contactId: string; firstName: string; lastName: string | null; phone: string | null;
};
type Member = { id: string; name: string; status: Status };

const TABS = [
  { k: "open", l: "Open" }, { k: "mine", l: "Mine" }, { k: "unassigned", l: "Unassigned" },
  { k: "acknowledged", l: "Acknowledged" }, { k: "closed", l: "Closed" }, { k: "all", l: "All" },
];
const PAGE = 50;

export function LeadsView(p: {
  rows: Row[]; total: number; page: number; filter: string; team: Member[]; me: string;
  canManage: boolean; canCreate: boolean; teamView: boolean; serverNow: number;
}) {
  const now = useServerClock(p.serverNow);
  const pages = Math.max(1, Math.ceil(p.total / PAGE));
  return (
    <div>
      <PageHeader title={<>Leads</>} description={p.teamView ? "Every inbound lead, its single accountable owner and the time left to respond." : "Leads you own. Acknowledge before the timer runs out — or it moves on."}>
        {p.canCreate && <NewLeadDialog trigger={<button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-sm font-medium text-signal-foreground transition-transform active:scale-[0.97]"><Plus className="size-4" /> New lead</button>} />}
      </PageHeader>

      <nav className="flex gap-1 overflow-x-auto border-b border-hairline px-4 sm:px-8" aria-label="Lead filters">
        {TABS.filter((t) => p.teamView || !["mine", "all"].includes(t.k)).map((t) => {
          const active = p.filter === t.k;
          return (
            <Link key={t.k} href={`/leads?f=${t.k}`} aria-current={active ? "page" : undefined}
              className={`relative whitespace-nowrap px-3 py-3 text-sm transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.l}
              {active && <motion.span layoutId="lead-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />}
            </Link>
          );
        })}
      </nav>

      {p.rows.length === 0 ? (
        <EmptyState icon={Zap} title="No leads here" body="New leads from your web form, WhatsApp and manual entry will appear instantly — no refresh needed." />
      ) : (
        <ul className="divide-y divide-hairline" aria-label="Leads">
          <AnimatePresence initial={false}>
            {p.rows.map((r, i) => <LeadRow key={r.id} r={r} i={i} now={now} me={p.me} team={p.team} canManage={p.canManage} />)}
          </AnimatePresence>
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-4 text-sm text-muted-foreground sm:px-8">
          <span>{p.total} leads · page {p.page} of {pages}</span>
          <div className="flex gap-1">
            <PageLink disabled={p.page <= 1} href={`/leads?f=${p.filter}&p=${p.page - 1}`} label="Previous page"><ChevronLeft className="size-4" /></PageLink>
            <PageLink disabled={p.page >= pages} href={`/leads?f=${p.filter}&p=${p.page + 1}`} label="Next page"><ChevronRight className="size-4" /></PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({ disabled, href, label, children }: { disabled: boolean; href: string; label: string; children: React.ReactNode }) {
  return disabled
    ? <span aria-disabled className="grid size-8 place-items-center rounded-lg opacity-40">{children}</span>
    : <Link href={href} aria-label={label} className="grid size-8 place-items-center rounded-lg hover:bg-accent">{children}</Link>;
}

function LeadRow({ r, i, now, me, team, canManage }: { r: Row; i: number; now: number; me: string; team: Member[]; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [busyAction, setBusy] = useState<string | null>(null);
  const mine = r.ownerId === me;
  const late = r.status === "assigned" && (r.exhaustedAt || (r.ackDeadline && r.ackDeadline < now));

  const ack = () => { setBusy("ack"); start(async () => {
    const res = await acknowledgeAction(r.id);
    res.ok ? toast.success("Lead acknowledged", { description: "Your response time has been recorded." }) : toast.error(res.error);
    setBusy(null);
  }); };
  const move = (to: Member) => { setBusy("move"); start(async () => {
    const res = await reassignAction(r.id, to.id);
    res.ok ? toast.success(`Reassigned to ${to.name}`) : toast.error(res.error);
    setBusy(null);
  }); };

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 10) * 0.025 }}
      className={`group relative flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface/60 sm:flex-row sm:items-center sm:gap-5 sm:px-8 ${late ? "bg-destructive/[0.04]" : ""}`}>
      {late && <span className="absolute inset-y-0 left-0 w-0.5 bg-destructive" aria-hidden />}

      <div className="flex min-w-0 flex-1 items-center gap-4">
        {r.status === "assigned" && r.ackDeadline && r.assignedAt
          ? <CountdownRing deadline={r.ackDeadline} start={r.assignedAt} now={now} />
          : <div className={`grid size-11 shrink-0 place-items-center rounded-full border ${r.status === "acknowledged" ? "border-ok/30 bg-ok/10 text-ok" : r.status === "unassigned" ? "border-ember/30 bg-ember/10 text-ember" : "border-hairline text-muted-foreground"}`}>
              {r.status === "acknowledged" ? <Check className="size-4" aria-label="Acknowledged" /> : <span className="text-[10px] font-medium uppercase">{r.status === "unassigned" ? "wait" : "done"}</span>}
            </div>}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/leads/${r.id}`} className="font-medium hover:underline hover:underline-offset-4">{r.firstName} {r.lastName}</Link>
            <SourceBadge source={r.source} />
            {r.escalationCount > 0 && <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[11px] text-ember">Escalated ×{r.escalationCount}</span>}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.message || r.phone || "No message"}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:w-[22rem] sm:justify-end">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {r.ownerName ? <>
            <Avatar name={r.ownerName} />
            <span className="truncate">{mine ? "You" : r.ownerName}</span>
            {r.ownerStatus && <StatusDot status={r.ownerStatus} />}
          </> : <span className="text-ember">Waiting for an available employee</span>}
        </div>
        <span className="hidden text-xs text-muted-foreground tabular md:inline">{fmtDuration(now - r.createdAt)} ago</span>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          {mine && r.status === "assigned" && (
            <button onClick={ack} disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-signal px-3 text-xs font-medium text-signal-foreground transition-transform active:scale-95 disabled:opacity-60">
              {busyAction === "ack" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Acknowledge
            </button>
          )}
          {canManage && r.status !== "closed" && (
            <DropdownMenu>
              <DropdownMenuTrigger disabled={pending} aria-label="Reassign lead" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                {busyAction === "move" ? <Loader2 className="size-4 animate-spin" /> : <Repeat2 className="size-4" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Reassign to</DropdownMenuLabel>
                {team.filter((m) => m.id !== r.ownerId).map((m) => (
                  <DropdownMenuItem key={m.id} disabled={m.status === "on_leave" || m.status === "offline"} onSelect={() => move(m)} className="gap-2">
                    <StatusDot status={m.status} /> {m.name}
                    <span className="ml-auto text-[11px] text-muted-foreground">{STATUS_LABEL[m.status]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Link href={`/leads/${r.id}`} aria-label="Open lead" className="grid size-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </motion.li>
  );
}

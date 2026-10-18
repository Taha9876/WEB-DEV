"use client";

import { BadgeCheck, CalendarCheck2, Check, CheckCheck, CreditCard, MessageCircle, Phone, Sparkles, X, Zap } from "lucide-react";
import type { Orientation } from "./fold-device";

const ring = (pct: number, color: string, size = 34) => {
  const r = size / 2 - 3, C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.5" className="stroke-foreground/10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" stroke={color} strokeDasharray={C}
        style={{ strokeDashoffset: C * (1 - pct), animation: `dev-tick 9s linear infinite`, ["--c" as string]: C }} />
    </svg>
  );
};

const LEADS = [
  { n: "Sara Khan", m: "10kW rooftop quote before Friday", s: "WhatsApp", t: "0:41", p: 0.7, c: "var(--signal)" },
  { n: "Ahmed Ali", m: "Net metering 15kW — kitna kharcha?", s: "WhatsApp", t: "0:12", p: 0.22, c: "var(--ember)" },
  { n: "Fatima Noor", m: "Interested in batteries", s: "Web form", t: "✓", p: 1, c: "var(--ok)" },
  { n: "Zain Hassan", m: "Warehouse roof, 2,000 m²", s: "Manual", t: "1:58", p: 0.9, c: "var(--signal)" },
];

function LeadList() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-2">
      <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[13px] font-semibold">Leads</span><span className="text-[11px] text-muted-foreground">3 need you now</span></div>
      {LEADS.map((l) => (
        <div key={l.n} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
          <div className="relative grid place-items-center">{ring(l.p, l.c)}<span className="absolute font-mono text-[9px]">{l.t}</span></div>
          <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{l.n} <span className="ml-1 rounded-full border border-hairline px-1.5 text-[9px] text-muted-foreground">{l.s}</span></p>
            <p className="truncate text-[11px] text-muted-foreground">{l.m}</p></div>
          {l.t !== "✓" ? <span className="rounded-md bg-signal px-2 py-1 text-[10px] font-semibold text-signal-foreground">Acknowledge</span> : <Check className="size-4 text-ok" />}
        </div>
      ))}
    </div>
  );
}

function Chain() {
  const steps = [["Ayesha R.", "Round-robin", "missed"], ["Bilal K.", "Next available", "missed"], ["Hina S.", "Backup", "live"]] as const;
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold"><Zap className="size-3.5 text-signal" /> Escalation · Ahmed Ali</p>
      {steps.map(([n, r, s], i) => (
        <div key={n} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${s === "live" ? "bg-signal/10" : ""}`}>
          <span className={`grid size-5 place-items-center rounded-full text-[9px] ${s === "live" ? "bg-signal text-signal-foreground" : "bg-ember/15 text-ember"}`}>{i + 1}</span>
          <span className="flex-1 text-[12px]">{n} <span className="text-muted-foreground">· {r}</span></span>
          <span className={`text-[10px] font-medium ${s === "live" ? "text-signal" : "text-ember"}`}>{s === "live" ? "Waiting…" : "Escalated"}</span>
        </div>
      ))}
    </div>
  );
}

function Thread() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold"><MessageCircle className="size-3.5 text-signal" /> WhatsApp</p>
      <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-1.5 text-[11px]">Salam, 15kW net metering ka kitna kharcha hoga?</p>
      <p className="ml-auto mt-1.5 w-fit max-w-[85%] rounded-2xl rounded-br-md bg-signal/15 px-3 py-1.5 text-[11px]">Walaikum salam! Usually 3.1–3.4M PKR. Free site survey Thursday 4pm?</p>
      <p className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted-foreground"><CheckCheck className="size-3 text-signal" /> Read</p>
      <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-signal/25 bg-signal/5 px-2 py-1.5 text-[10px] text-muted-foreground"><Sparkles className="size-3 text-signal" /> AI draft ready — review before sending</p>
    </div>
  );
}

function Stats() {
  const s = [["New today", "12"], ["First response", "38s"], ["Recovery", "2"], ["Collected", "$18.4k"]];
  return (
    <div className="grid grid-cols-2 gap-2">
      {s.map(([l, v]) => (
        <div key={l} className="rounded-2xl border border-hairline bg-surface p-3">
          <p className="text-[10px] text-muted-foreground">{l}</p><p className="mt-1 text-[24px] font-semibold tracking-tight">{v}</p>
        </div>
      ))}
    </div>
  );
}

function Pipeline() {
  const bars = [["New", 62], ["Site survey", 78], ["Proposal", 100], ["Won", 40]] as const;
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-3">
      <p className="mb-2 text-[12px] font-semibold">Open pipeline</p>
      {bars.map(([n, w]) => (
        <div key={n} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 py-1">
          <span className="text-[10px] text-muted-foreground">{n}</span>
          <span className="h-2 rounded-full bg-muted"><span className="block h-full rounded-r-[4px] rounded-l-full bg-signal" style={{ width: `${w}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

function PayAndBook() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border border-hairline bg-surface p-3">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CreditCard className="size-3.5" /> Deposit</p>
        <p className="mt-1 font-mono text-[16px]">$1,250.00</p><span className="mt-1.5 inline-block rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">Paid · webhook</span>
      </div>
      <div className="rounded-2xl border border-hairline bg-surface p-3">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarCheck2 className="size-3.5" /> Site visit</p>
        <p className="mt-1 text-[13px] font-medium">Thu 16:00</p><span className="mt-1.5 inline-block text-[10px] text-muted-foreground">On Hina&apos;s Google Calendar</span>
      </div>
    </div>
  );
}

/** The open screen: a living miniature of Relay. Taller than the display, so it scrolls inside. */
export function DeviceScreen({ o }: { o: Orientation }) {
  if (o === "portrait")
    return (
      <div className="space-y-2.5 px-3 pb-10 pt-12" style={{ width: 358 }}>
        <p className="px-1 text-[22px] font-semibold tracking-tight">Good morning, Hina</p>
        <LeadList /><Chain /><Thread /><Stats /><Pipeline /><PayAndBook />
      </div>
    );
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-3 px-6 pb-12 pt-14" style={{ width: 976 }}>
      <div className="space-y-3">
        <p className="px-1 text-[30px] font-semibold tracking-tight">Good morning, <span className="text-accent-text">Hina</span></p>
        <LeadList /><Stats /><PayAndBook />
      </div>
      <div className="space-y-3 pt-[52px]"><Chain /><Thread /><Pipeline />
        <div className="rounded-2xl border border-hairline bg-surface p-3 text-[11px] text-muted-foreground">
          <p className="mb-1 text-[12px] font-semibold text-foreground">Audit</p>
          {["lead.escalated · system", "role.updated · Owner", "payment.paid · stripe"].map((x) => <p key={x} className="font-mono">• {x}</p>)}
        </div>
      </div>
    </div>
  );
}

/** Outer screen when folded: an incoming lead, like a call. */
export function CoverIncoming() {
  return (
    <div className="flex h-full flex-col items-center justify-between bg-gradient-to-b from-signal/25 via-background to-background px-6 pb-10 pt-16 text-center">
      <div>
        <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">New lead · WhatsApp</p>
        <div className="mx-auto mt-6 grid size-24 place-items-center rounded-full bg-signal/20 text-[30px] font-semibold ring-8 ring-signal/10">SK</div>
        <p className="mt-5 text-[30px] font-semibold tracking-tight">Sara Khan</p>
        <p className="mt-2 text-[14px] text-muted-foreground">“Need a 10kW rooftop quote before Friday.”</p>
        <p className="mt-6 font-mono text-[44px] tabular text-signal">0:45</p>
        <p className="text-[12px] text-muted-foreground">to acknowledge before it escalates</p>
      </div>
      <div className="flex w-full justify-around">
        <span className="grid size-16 place-items-center rounded-full bg-destructive/90 text-white"><X className="size-7" /></span>
        <span className="grid size-16 place-items-center rounded-full bg-ok text-white shadow-[0_0_30px_var(--ok)]"><Phone className="size-7" /></span>
      </div>
    </div>
  );
}

/** Outer screen at the end of the story. */
export function CoverDone() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-ok/20 via-background to-background px-6 text-center">
      <BadgeCheck className="size-20 text-ok" />
      <p className="mt-6 text-[30px] font-semibold tracking-tight">Acknowledged</p>
      <p className="mt-2 text-[14px] text-muted-foreground">Sara Khan · owned by Ayesha R.</p>
      <p className="mt-8 font-mono text-[44px] tabular">38s</p>
      <p className="text-[12px] text-muted-foreground">time to first response</p>
    </div>
  );
}

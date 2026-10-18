"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { animate, motion, useInView } from "motion/react";
import { toast } from "sonner";
import { AlarmClock, ArrowUpRight, CalendarDays, CircleDollarSign, Eye, GitBranch, Loader2, Settings2, Sparkles, Timer, Users, Zap } from "lucide-react";
import { Avatar, fmtDuration } from "@/components/app/primitives";
import { StatusDot, STATUS_LABEL, type Status } from "@/components/app/status";
import { saveDashboardPrefsAction, briefingAction } from "@/app/(app)/_actions/dashboard";
import { money } from "@/lib/format";

type D = {
  scope: "company" | "personal"; timezone: string; newLeadsToday: number; avgFirstResponseSec: number | null; responsesMeasured: number; recoveryCount: number;
  escalations24h: number; pipelineByStage: { stageId: string; stage: string; pipeline: string; value: number; n: number }[] | null; openPipelineValue: number | null;
  collectedThisMonth: number | null; paymentsThisMonth: number; projected: number | null;
  availability: { id: string; name: string; status: Status; open: number }[]; upcoming: { id: string; title: string; startsAt: string; contactId: string; who: string }[];
};

const TILES = ["newLeads", "response", "recovery", "escalations", "pipeline", "availability", "appointments", "collected"] as const;
type Tile = (typeof TILES)[number];
const TILE_LABEL: Record<Tile, string> = { newLeads: "New leads today", response: "Avg. first response", recovery: "Recovery queue", escalations: "Escalated (24h)", pipeline: "Open pipeline by stage", availability: "Team availability", appointments: "Upcoming appointments", collected: "Collected this month" };

export function DashboardView({ d, name, prefs, canBrief, currency }: { d: D; name: string; prefs: Record<string, boolean>; canBrief: boolean; currency: string }) {
  const [shown, setShown] = useState<Record<string, boolean>>(() => Object.fromEntries(TILES.map((t) => [t, prefs[t] !== false])));
  const [editing, setEditing] = useState(false);
  const on = (t: Tile) => shown[t];
  const toggle = async (t: Tile) => {
    const next = { ...shown, [t]: !shown[t] };
    setShown(next);
    const r = await saveDashboardPrefsAction(next);
    if (!r.ok) toast.error(r.error);
  };
  const hour = new Date().getHours();

  return (
    <div className="pb-16">
      <header className="relative overflow-hidden border-b border-hairline px-4 pb-8 pt-10 sm:px-8">
        <div className="pointer-events-none absolute -top-48 right-0 size-[32rem] rounded-full bg-signal/[0.07] blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{d.scope === "company" ? "Company-wide · live" : "Your numbers · live"}</p>
            <h1 className="mt-1 font-display text-5xl leading-none md:text-6xl">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, <em>{name}</em></h1>
          </div>
          <button onClick={() => setEditing((e) => !e)} aria-pressed={editing} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-accent"><Settings2 className="size-4" /> Customize</button>
        </div>
        {editing && (
          <motion.fieldset initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="relative mt-5 flex flex-wrap gap-2">
            <legend className="sr-only">Show or hide figures</legend>
            {TILES.map((t) => (
              <button key={t} onClick={() => toggle(t)} aria-pressed={on(t)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${on(t) ? "border-signal/40 bg-signal/10 text-foreground" : "border-hairline text-muted-foreground line-through"}`}>
                <Eye className="size-3" />{TILE_LABEL[t]}</button>
            ))}
          </motion.fieldset>
        )}
      </header>

      <div className="space-y-4 px-4 pt-6 sm:px-8">
        {canBrief && <Briefing />}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {on("newLeads") && <Stat i={0} icon={Zap} label="New leads today" value={d.newLeadsToday} href="/leads?f=today" hint={`Since midnight · ${d.timezone}`} />}
          {on("response") && <Stat i={1} icon={Timer} label="Avg. time to first response" text={d.avgFirstResponseSec !== null ? fmtDuration(d.avgFirstResponseSec * 1000) : "—"} hint={`First assignment → first acknowledgement · ${d.responsesMeasured} leads, 30 days`} />}
          {on("recovery") && <Stat i={2} icon={AlarmClock} label="In recovery queue" value={d.recoveryCount} href="/recovery" tone={d.recoveryCount ? "ember" : undefined} hint="Late, escalated ≥2×, idle, or ownerless" />}
          {on("escalations") && <Stat i={3} icon={GitBranch} label="Leads escalated · 24h" value={d.escalations24h} href="/leads?f=escalated" hint="Automatic only — manual reassignments excluded" />}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {on("pipeline") && <PipelineChart d={d} currency={currency} />}
          {on("collected") && (
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="edge rounded-3xl p-6" aria-label="Revenue">
              <h2 className="flex items-center gap-2 text-sm text-muted-foreground"><CircleDollarSign className="size-4" /> Collected this month</h2>
              {d.collectedThisMonth === null ? <p className="mt-4 text-sm text-muted-foreground">Your role can&apos;t see money figures.</p> : <>
                <p className="mt-3 font-display text-6xl tabular"><Counter to={d.collectedThisMonth / 100} format={(v) => money(Math.round(v * 100), currency, true)} /></p>
                <p className="mt-1 text-xs text-muted-foreground">{d.paymentsThisMonth} payment{d.paymentsThisMonth === 1 ? "" : "s"} confirmed by Stripe webhooks, net of refunds</p>
                <div className="mt-6 border-t border-hairline pt-4">
                  <p className="text-xs text-muted-foreground">Projected (not yet collected)</p>
                  <p className="mt-1 font-mono text-xl tabular text-muted-foreground">{money(d.projected, currency, true)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">Open opportunity value + unpaid payment links. Never counted as revenue.</p>
                </div>
              </>}
            </motion.section>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {on("availability") && (
            <section className="edge rounded-3xl p-6" aria-labelledby="av-h">
              <div className="flex items-center justify-between"><h2 id="av-h" className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" /> Team availability</h2>
                <Link href="/settings/team" className="text-xs text-muted-foreground hover:text-foreground">Manage →</Link></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => {
                  const n = d.availability.filter((a) => a.status === s).length;
                  return <span key={s} className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-sm"><StatusDot status={s} />{STATUS_LABEL[s]} <b className="font-mono tabular">{n}</b></span>;
                })}
              </div>
              <ul className="mt-4 space-y-1">
                {d.availability.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm">
                    <Avatar name={a.name} /><span className="flex-1">{a.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusDot status={a.status} />{STATUS_LABEL[a.status]}</span>
                    <span className="w-16 text-right font-mono text-xs tabular text-muted-foreground">{a.open} open</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {on("appointments") && (
            <section className="edge rounded-3xl p-6" aria-labelledby="ap-h">
              <div className="flex items-center justify-between"><h2 id="ap-h" className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" /> Next 7 days</h2>
                <Link href="/appointments" className="text-xs text-muted-foreground hover:text-foreground">All →</Link></div>
              {d.upcoming.length ? (
                <ul className="mt-4 space-y-2">
                  {d.upcoming.map((a) => (
                    <li key={a.id}><Link href={`/contacts/${a.contactId}`} className="flex items-center gap-4 rounded-xl p-2 hover:bg-accent/50">
                      <span className="w-24 shrink-0 font-mono text-xs tabular">{new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: d.timezone }).format(new Date(a.startsAt))}</span>
                      <span className="flex-1 truncate text-sm">{a.title}</span><span className="text-xs text-muted-foreground">{a.who}</span></Link></li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-muted-foreground">Nothing booked.</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Counter({ to, format = (v: number) => Math.round(v).toLocaleString() }: { to: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const c = animate(0, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = format(v)) });
    return () => c.stop();
  }, [inView, to, format]);
  return <span ref={ref}>{format(to)}</span>;
}

function Stat({ i, icon: I, label, value, text, href, hint, tone }: { i: number; icon: React.ElementType; label: string; value?: number; text?: string; href?: string; hint: string; tone?: "ember" }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-muted-foreground"><I className="size-4" />{label}</span>
        {href && <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <p className={`mt-4 font-display text-6xl leading-none tabular ${tone === "ember" ? "text-ember" : ""}`}>{value !== undefined ? <Counter to={value} /> : text}</p>
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
      {href ? <Link href={href} className="edge group block rounded-3xl p-6 transition-transform hover:-translate-y-0.5" aria-label={`${label}: ${value ?? text}. Open the list`}>{body}</Link>
        : <div className="edge rounded-3xl p-6">{body}</div>}
    </motion.div>
  );
}

/** Single-series magnitude → one hue, no legend, thin rounded bars, direct labels in text ink, per-bar tooltip, sr-only table. */
function PipelineChart({ d, currency }: { d: D; currency: string }) {
  const rows = d.pipelineByStage;
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...(rows ?? []).map((r) => r.value));
  const multi = new Set(rows?.map((r) => r.pipeline)).size > 1;
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="edge rounded-3xl p-6" aria-labelledby="pv-h">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="pv-h" className="text-sm text-muted-foreground">Open pipeline value by stage</h2>
        {d.openPipelineValue !== null && <span className="font-mono text-sm tabular">{money(d.openPipelineValue, currency)}</span>}
      </div>
      {!rows ? <p className="mt-6 text-sm text-muted-foreground">Values are hidden for your role.</p> : !rows.length ? <p className="mt-6 text-sm text-muted-foreground">No open stages.</p> : (
        <>
          <ul className="mt-6 space-y-[2px]" aria-hidden>
            {rows.map((r, i) => (
              <li key={r.stageId}>
                <Link href="/pipeline" onMouseEnter={() => setHover(r.stageId)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.stageId)} onBlur={() => setHover(null)}
                  className="group relative grid grid-cols-[7.5rem_1fr_6rem] items-center gap-3 rounded-lg py-2 outline-none">
                  <span className="truncate text-xs text-muted-foreground">{multi ? `${r.pipeline} · ` : ""}{r.stage}</span>
                  <span className="relative h-3 rounded-full bg-muted/40">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%` }} transition={{ duration: 0.9, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className={`absolute inset-y-0 left-0 rounded-r-[4px] rounded-l-full bg-signal transition-opacity ${hover && hover !== r.stageId ? "opacity-40" : ""}`} />
                  </span>
                  <span className="text-right font-mono text-xs tabular">{money(r.value, currency, true)}</span>
                  {hover === r.stageId && (
                    <span role="tooltip" className="pointer-events-none absolute -top-9 left-32 z-10 rounded-lg border border-hairline bg-popover px-2.5 py-1.5 text-xs shadow-xl">
                      <b className="font-medium">{r.stage}</b> · {r.n} deal{r.n === 1 ? "" : "s"} · {money(r.value, currency)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <table className="sr-only"><caption>Open pipeline value by stage</caption><thead><tr><th>Stage</th><th>Deals</th><th>Value</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.stageId}><td>{r.pipeline} {r.stage}</td><td>{r.n}</td><td>{money(r.value, currency)}</td></tr>)}</tbody></table>
        </>
      )}
    </motion.section>
  );
}

function Briefing() {
  const [b, setB] = useState<{ headline: string; points: string[] } | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => { const r = await briefingAction(); r.ok ? setB(r.data as never) : toast.error(r.error); });
  return (
    <section className="relative overflow-hidden rounded-3xl border border-signal/20 bg-gradient-to-br from-signal/[0.07] via-transparent to-chart-3/[0.05] p-6" aria-label="AI briefing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-signal" /> Team briefing</h2>
        <button onClick={go} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background disabled:opacity-60">
          {pending && <Loader2 className="size-3 animate-spin" />}{b ? "Refresh" : "Generate from live numbers"}</button>
      </div>
      {b ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="mt-3 text-lg">{b.headline}</p>
          <ul className="mt-3 space-y-1.5">{b.points.map((p, i) => <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="flex gap-2 text-sm text-muted-foreground"><span className="mt-2 size-1 shrink-0 rounded-full bg-signal" />{p}</motion.li>)}</ul>
        </motion.div>
      ) : <p className="mt-2 text-sm text-muted-foreground">One paragraph on who&apos;s overloaded, what&apos;s slipping and where to look first — built only from the numbers on this page.</p>}
    </section>
  );
}

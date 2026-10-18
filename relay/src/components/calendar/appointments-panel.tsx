"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, CalendarX2, Loader2 } from "lucide-react";
import { Section, Empty } from "@/components/crm/contact-detail";
import { bookAction, cancelAppointmentAction, previewBusyAction, rescheduleAction } from "@/app/(app)/_actions/appointments";

type Appt = { id: string; title: string; startsAt: string; endsAt: string; timezone: string; status: string; userName: string | null; googleEventId: string | null };
type Member = { id: string; name: string; timezone: string; calendar: string | null };
type Overlap = { start: string; end: string };

const fmt = (d: string | Date, tz: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(d));
const toLocalInput = (d: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

/** I3.3–I3.7: books on the employee's real Google Calendar, warns on overlaps, shows times in both zones. */
export function AppointmentsPanel({ contactId, appointments, opportunities, team, me, openFor }: {
  contactId: string; appointments: Appt[]; opportunities: { id: string; title: string }[]; team: Member[]; me: { id: string; timezone: string }; openFor?: string;
}) {
  const [open, setOpen] = useState(!!openFor);
  const [pending, start] = useTransition();
  const router = useRouter();
  const connected = team.filter((t) => t.calendar === "connected");
  const [userId, setUserId] = useState(connected.find((t) => t.id === me.id)?.id ?? connected[0]?.id ?? "");
  const emp = team.find((t) => t.id === userId);
  const tz = emp?.timezone ?? me.timezone;
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000), tz));
  const [duration, setDuration] = useState(30);
  const [overlaps, setOverlaps] = useState<Overlap[] | null>(null);
  const [checking, startCheck] = useTransition();
  useEffect(() => { if (openFor) setOpen(true); }, [openFor]);

  // Live conflict preview from the employee's real free/busy (I3.4).
  useEffect(() => {
    if (!open || !userId || !when) return;
    const t = setTimeout(() => startCheck(async () => {
      const r = await previewBusyAction(userId, when, duration, tz);
      setOverlaps(r.ok ? (r.data as { overlaps: Overlap[] }).overlaps : null);
      if (!r.ok) toast.error(r.error);
    }), 400);
    return () => clearTimeout(t);
  }, [open, userId, when, duration, tz]);

  const submit = (f: FormData, force = false): void => start(async () => {
    const r = await bookAction({ contactId, opportunityId: f.get("opportunityId") ?? "", userId, title: f.get("title"), local: when, durationMin: duration, timezone: tz, force });
    if (!r.ok) {
      if ((r.details as { canForce?: boolean } | undefined)?.canForce && confirm(`${r.error}\n\nBook anyway?`)) return submit(f, true);
      toast.error(r.error); return;
    }
    setOpen(false); toast.success("Booked — it's on their Google Calendar"); router.refresh();
  });
  const moveAppt = (a: Appt) => {
    const v = prompt(`New start time (${a.timezone}), format YYYY-MM-DDTHH:MM`, toLocalInput(new Date(a.startsAt), a.timezone));
    if (!v) return;
    const mins = Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000);
    start(async () => { const r = await rescheduleAction(a.id, v, mins); r.ok ? (toast.success("Rescheduled in Google Calendar"), router.refresh()) : toast.error(r.error); });
  };
  const cancelAppt = (a: Appt) => confirm(`Cancel "${a.title}"? It will be removed from Google Calendar.`) &&
    start(async () => { const r = await cancelAppointmentAction(a.id); r.ok ? (toast.success("Cancelled"), router.refresh()) : toast.error(r.error); });

  return (
    <Section title="Appointments" icon={CalendarDays} action={!open ? <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground">+ Book</button> : null}>
      {open && (connected.length === 0 ? (
        <p role="status" className="mx-2 mb-2 rounded-xl border border-hairline bg-background/60 p-3 text-sm text-muted-foreground">
          Nobody on the team has connected Google Calendar, so no one can be booked yet. Each employee connects theirs under <Link href="/settings/profile" className="text-foreground underline underline-offset-4">Profile &amp; alerts</Link>.
        </p>
      ) : (
        <form action={(f) => submit(f)} className="mx-2 mb-2 space-y-2 rounded-xl border border-hairline bg-background/60 p-3">
          <label htmlFor="ap-emp" className="block text-xs">With</label>
          <select id="ap-emp" value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">
            {team.map((t) => <option key={t.id} value={t.id} disabled={t.calendar !== "connected"}>
              {t.name}{t.calendar === "connected" ? "" : t.calendar === "needs_reconnect" ? " — calendar needs reconnecting" : " — calendar not connected"}</option>)}
          </select>
          <input name="title" aria-label="Title" required defaultValue="Site visit" className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm" />
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <div><label htmlFor="ap-when" className="mb-1 block text-xs">Start ({tz})</label>
              <input id="ap-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm" /></div>
            <div><label htmlFor="ap-dur" className="mb-1 block text-xs">Minutes</label>
              <select id="ap-dur" value={duration} onChange={(e) => setDuration(+e.target.value)} className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">
                {[15, 30, 45, 60, 90, 120].map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          {tz !== me.timezone && when && <p className="text-[11px] text-muted-foreground">Time is in {emp?.name}&apos;s time zone ({tz}); you are in {me.timezone}.</p>}
          <p aria-live="polite" className={`flex items-center gap-1.5 text-[11px] ${overlaps?.length ? "text-ember" : "text-muted-foreground"}`}>
            {checking ? <><Loader2 className="size-3 animate-spin" /> Checking their calendar…</>
              : overlaps === null ? null : overlaps.length ? <><AlertTriangle className="size-3" /> Overlaps {overlaps.length} busy slot(s): {overlaps.map((o) => `${fmt(o.start, tz)}–${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(o.end))}`).join(", ")}</>
              : <>✓ Free at that time</>}
          </p>
          {opportunities.length > 0 && <select name="opportunityId" aria-label="Opportunity" defaultValue={openFor ?? ""} className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">
            <option value="">No opportunity</option>{opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>}
          <div className="flex gap-2">
            <button disabled={pending || !userId} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-signal text-xs font-medium text-signal-foreground disabled:opacity-60">{pending && <Loader2 className="size-3 animate-spin" />}Book</button>
            <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg border border-input px-3 text-xs">Cancel</button>
          </div>
        </form>
      ))}
      {appointments.length ? appointments.map((a) => (
        <div key={a.id} className={`rounded-xl px-3 py-2.5 hover:bg-accent/50 ${a.status === "cancelled" ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-medium ${a.status === "cancelled" ? "line-through" : ""}`}>{a.title}</span>
            {a.status === "cancelled" ? <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarX2 className="size-3" />Cancelled</span>
              : <span className="text-[11px] text-muted-foreground">{a.userName}</span>}
          </div>
          <p className="mt-0.5 text-xs">{fmt(a.startsAt, a.timezone)} <span className="text-muted-foreground">({a.timezone})</span></p>
          {a.timezone !== me.timezone && <p className="text-[11px] text-muted-foreground">Your time: {fmt(a.startsAt, me.timezone)}</p>}
          {a.status === "scheduled" && new Date(a.endsAt) > new Date() && (
            <div className="mt-1.5 flex gap-3 text-[11px]">
              <button onClick={() => moveAppt(a)} disabled={pending} className="text-muted-foreground hover:text-foreground">Reschedule</button>
              <button onClick={() => cancelAppt(a)} disabled={pending} className="text-destructive hover:underline">Cancel</button>
            </div>
          )}
        </div>
      )) : !open && <Empty>No appointments.</Empty>}
    </Section>
  );
}

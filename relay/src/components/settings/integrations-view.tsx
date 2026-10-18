"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, CreditCard, Loader2, MessageCircle, Send, CalendarDays, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app/primitives";
import { connectAction, disconnectAction } from "@/app/(app)/_actions/integrations";
import { relative, dateTime } from "@/lib/format";

type Card = {
  provider: "twilio" | "stripe" | "google" | "telegram"; status: "connected" | "not_connected" | "error"; publicConfig: Record<string, string>;
  lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null; errors: { at: string; kind: string; error: string | null; reference: string | null }[];
  limits: { can: string[]; cannot: string[] }; webhooks: Record<string, string>; team: { name: string; status: string; detail: string }[];
};
type Ev = { id: number; provider: string; direction: string; kind: string; reference: string | null; result: string; error: string | null; createdAt: string };

const META = {
  twilio: { name: "WhatsApp", by: "Twilio Sandbox", icon: MessageCircle, purpose: "Talk to customers and capture leads from incoming messages.",
    fields: [{ k: "accountSid", l: "Account SID", p: "AC…" }, { k: "authToken", l: "Auth token", p: "••••", secret: true }, { k: "from", l: "Sandbox number", p: "+14155238886" }] },
  stripe: { name: "Payments", by: "Stripe · test mode", icon: CreditCard, purpose: "Collect payments for opportunities.",
    fields: [{ k: "secretKey", l: "Secret key", p: "sk_test_…", secret: true }, { k: "webhookSecret", l: "Webhook signing secret", p: "whsec_…", secret: true }] },
  google: { name: "Calendar", by: "Google Calendar · OAuth 2.0", icon: CalendarDays, purpose: "Book appointments on employees' real calendars.", fields: [] },
  telegram: { name: "Escalation alerts", by: "Telegram bot", icon: Send, purpose: "Alert employees outside the app when a lead escalates.",
    fields: [{ k: "botToken", l: "Bot token from @BotFather", p: "123456:ABC…", secret: true }] },
} as const;

const STATUS = {
  connected: { l: "Connected", icon: CheckCircle2, cls: "text-ok bg-ok/10 border-ok/30" },
  not_connected: { l: "Not connected", icon: CircleDashed, cls: "text-muted-foreground bg-muted border-hairline" },
  error: { l: "Error", icon: XCircle, cls: "text-destructive bg-destructive/10 border-destructive/30" },
};

export function IntegrationsView({ cards, history, canManage, filter }: { cards: Card[]; history: Ev[]; canManage: boolean; filter: { provider: string; result: string } }) {
  const router = useRouter();
  return (
    <div className="pb-16">
      <PageHeader title="Integrations" description="Real services in sandbox / test mode. Each workspace uses its own credentials; secrets are encrypted and never sent to the browser." />
      <div className="grid gap-4 px-4 pt-6 sm:px-8 xl:grid-cols-2">
        {cards.map((c, i) => <ProviderCard key={c.provider} c={c} i={i} canManage={canManage} />)}
      </div>

      {canManage && (
        <section className="px-4 pt-10 sm:px-8" aria-labelledby="hist">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 id="hist" className="font-display text-3xl">Sync history</h2><p className="text-sm text-muted-foreground">Every inbound webhook and outbound call, with its result.</p></div>
            <div className="flex gap-2">
              <select aria-label="Provider" value={filter.provider} onChange={(e) => router.push(`?provider=${e.target.value}&result=${filter.result}`)} className="h-9 rounded-lg border border-input bg-surface px-2 text-sm">
                <option value="">All providers</option>{Object.entries(META).map(([k, m]) => <option key={k} value={k}>{m.by}</option>)}</select>
              <select aria-label="Result" value={filter.result} onChange={(e) => router.push(`?provider=${filter.provider}&result=${e.target.value}`)} className="h-9 rounded-lg border border-input bg-surface px-2 text-sm">
                <option value="">All results</option>{["success", "failure", "rejected", "duplicate", "retrying"].map((r) => <option key={r}>{r}</option>)}</select>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-hairline">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-hairline text-left text-xs text-muted-foreground">
                {["Time", "Provider", "Direction", "Event", "Result", "Reference / detail"].map((h) => <th key={h} className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id} className="border-b border-hairline last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground" title={dateTime(e.createdAt)}>{relative(e.createdAt)}</td>
                    <td className="px-4 py-2.5">{META[e.provider as keyof typeof META]?.by.split(" ")[0] ?? e.provider}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.direction === "inbound" ? "← in" : "→ out"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.kind}</td>
                    <td className="px-4 py-2.5"><ResultBadge r={e.result} /></td>
                    <td className="max-w-[22rem] px-4 py-2.5 text-xs"><span className="block truncate font-mono text-muted-foreground">{e.reference}</span>{e.error && <span className="block text-destructive">{e.error}</span>}</td>
                  </tr>
                ))}
                {!history.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No events yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ResultBadge({ r }: { r: string }) {
  const cls = r === "success" ? "bg-ok/10 text-ok" : r === "duplicate" ? "bg-chart-2/10 text-chart-2" : r === "retrying" ? "bg-warn/10 text-warn" : "bg-destructive/10 text-destructive";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{r}</span>;
}

function ProviderCard({ c, i, canManage }: { c: Card; i: number; canManage: boolean }) {
  const m = META[c.provider];
  const st = STATUS[c.status];
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (f: FormData) => start(async () => {
    const r = await connectAction(c.provider, Object.fromEntries(m.fields.map((x) => [x.k, String(f.get(x.k) ?? "")])));
    if (!r.ok) { setErrors((r.details as Record<string, string>) ?? {}); toast.error(r.error); return; }
    toast.success(`${m.name} connected — credentials verified with ${m.by.split(" ")[0]}`); setEditing(false); router.refresh();
  });
  const remove = () => confirm(`Disconnect ${m.name}? Relay will stop sending and receiving through it.`) &&
    start(async () => { const r = await disconnectAction(c.provider); r.ok ? (toast.success("Disconnected"), router.refresh()) : toast.error(r.error); });

  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="edge flex flex-col rounded-3xl p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl border border-hairline bg-background"><m.icon className="size-5 text-signal" /></span>
          <div><h2 className="font-medium">{m.name}</h2><p className="text-xs text-muted-foreground">{m.by}</p></div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${st.cls}`}><st.icon className="size-3.5" />{st.l}</span>
      </header>
      <p className="mt-4 text-sm text-muted-foreground">{m.purpose}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-background/60 p-3"><dt className="text-muted-foreground">Last worked</dt><dd className="mt-0.5">{c.lastSuccessAt ? relative(c.lastSuccessAt) : "—"}</dd></div>
        <div className="rounded-xl bg-background/60 p-3"><dt className="text-muted-foreground">Account</dt>
          <dd className="mt-0.5 truncate font-mono">{Object.entries(c.publicConfig).filter(([k]) => !["botUsername", "webhook"].includes(k)).map(([, v]) => v).join(" · ") || "—"}</dd></div>
      </dl>

      {c.lastError && c.status !== "not_connected" && (
        <p role="alert" className="mt-3 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"><AlertTriangle className="size-4 shrink-0" />
          <span>{c.lastError}{c.lastErrorAt && <span className="block text-destructive/70">{relative(c.lastErrorAt)}</span>}</span></p>
      )}

      {c.team.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs text-muted-foreground">{c.provider === "google" ? "Calendar connections" : "Alert destinations"}</p>
          <ul className="space-y-1">{c.team.map((t) => (
            <li key={t.name} className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-1.5 text-xs">
              <span>{t.name}</span>
              <span className={t.status === "connected" ? "text-ok" : t.status === "needs_reconnect" ? "text-ember" : "text-muted-foreground"}>
                {t.status === "connected" ? `✓ ${t.detail}` : t.status === "needs_reconnect" ? "Needs reconnect" : "Not connected"}</span>
            </li>))}</ul>
        </div>
      )}

      {Object.keys(c.webhooks).length > 0 && canManage && (
        <div className="mt-4 space-y-1.5">
          {Object.entries(c.webhooks).map(([k, v]) => (
            <div key={k}><p className="text-[11px] text-muted-foreground">{k}</p>
              <button onClick={() => { navigator.clipboard.writeText(v); toast.success("Copied"); }} className="group flex w-full items-center gap-2 rounded-lg bg-background/60 px-3 py-1.5 text-left font-mono text-[11px] hover:bg-accent">
                <span className="flex-1 truncate">{v}</span><Copy className="size-3 shrink-0 opacity-50 group-hover:opacity-100" /></button></div>
          ))}
        </div>
      )}

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">What it can and can&apos;t do</summary>
        <ul className="mt-2 space-y-1">{c.limits.can.map((x) => <li key={x} className="flex gap-2"><Check className="mt-px size-3.5 shrink-0 text-ok" />{x}</li>)}
          {c.limits.cannot.map((x) => <li key={x} className="flex gap-2 text-muted-foreground"><XCircle className="mt-px size-3.5 shrink-0" />{x}</li>)}</ul>
      </details>

      {c.errors.length > 0 && canManage && (
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground hover:text-foreground">Recent errors ({c.errors.length})</summary>
          <ul className="mt-2 space-y-1.5">{c.errors.map((e, j) => <li key={j} className="rounded-lg bg-background/60 p-2"><span className="font-mono">{e.kind}</span> · {relative(e.at)}<span className="block text-destructive">{e.error}</span></li>)}</ul></details>
      )}

      <div className="mt-auto pt-5">
        {c.provider === "google" ? (
          <p className="text-xs text-muted-foreground">Each employee connects their own calendar from <a href="/settings/profile" className="text-foreground underline underline-offset-4">Profile &amp; alerts</a>.</p>
        ) : !canManage ? (
          <p className="text-xs text-muted-foreground">Only people with the “Manage integrations” permission can change this.</p>
        ) : editing ? (
          <form action={submit} className="space-y-3">
            {m.fields.map((f) => (
              <div key={f.k}><label htmlFor={`${c.provider}-${f.k}`} className="mb-1 block text-xs">{f.l}</label>
                <input id={`${c.provider}-${f.k}`} name={f.k} type={"secret" in f && f.secret ? "password" : "text"} autoComplete="off" placeholder={f.p}
                  aria-invalid={!!errors[f.k]} className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:border-signal/60 aria-invalid:border-destructive/60" />
                {errors[f.k] && <p className="mt-1 text-xs text-destructive">{errors[f.k]}</p>}</div>
            ))}
            <div className="flex gap-2">
              <button disabled={pending} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60">
                {pending && <Loader2 className="size-4 animate-spin" />}{pending ? "Verifying…" : "Verify & connect"}</button>
              <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border border-input px-3 text-sm">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background">{c.status === "not_connected" ? "Connect" : "Update credentials"}</button>
            {c.status !== "not_connected" && <button onClick={remove} disabled={pending} className="h-9 rounded-lg border border-input px-3 text-sm text-destructive hover:bg-destructive/10">Disconnect</button>}
          </div>
        )}
      </div>
    </motion.article>
  );
}

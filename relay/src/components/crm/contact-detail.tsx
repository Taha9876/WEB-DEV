"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRightLeft, CalendarDays, CheckCircle2, CircleDollarSign, Clock, CreditCard, FilePen, GitCommitHorizontal, Loader2, Mail,
  MessageCircle, MessageCircleOff, Phone, Plus, Sparkles, StickyNote, Trash2, UserCheck, Zap,
} from "lucide-react";
import { Avatar, SourceBadge } from "@/components/app/primitives";
import { StatusDot, type Status } from "@/components/app/status";
import { money, dateTime, relative } from "@/lib/format";
import { CustomFieldInput, readCustom, type FieldDef } from "./custom-field-input";
import { addNoteAction, createOpportunityAction, deleteContactAction, updateContactAction } from "@/app/(app)/_actions/crm";
import { ConversationPanel } from "@/components/inbox/conversation-panel";
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { AppointmentsPanel } from "@/components/calendar/appointments-panel";

/* Shapes mirror getContactView() after JSON serialisation. */
type V = {
  contact: { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; tags: string[]; optedOut: boolean; custom: Record<string, unknown>; version: number; companyId: string | null; createdAt: string };
  company: { id: string; name: string } | null;
  owner: { id: string | null; name: string | null; status: Status | null } | null;
  fields: FieldDef[];
  opportunities: { id: string; title: string; valueCents: number | null; valueMasked: boolean; currency: string; stageName: string; stageKind: string; pipelineName: string; ownerName: string | null }[];
  payments: { id: string; amountCents: number | null; currency: string; status: string; refundedCents: number | null; url: string | null; paidAt: string | null; createdAt: string; opportunityId: string; requestedBy: string | null; reference: string | null; sessionId: string | null }[];
  appointments: { id: string; title: string; startsAt: string; endsAt: string; timezone: string; status: string; userName: string | null; googleEventId: string | null }[];
  conversations: { id: string; channel: string; messages: { id: string; direction: "inbound" | "outbound"; body: string; status: string; errorMessage: string | null; errorCode: string | null; createdAt: string; senderId: string | null }[] }[];
  leads: { id: string; status: string; source: "web_form" | "whatsapp" | "sms" | "manual"; createdAt: string }[];
  activities: { id: string; type: string; summary: string; data: Record<string, unknown>; createdAt: string; actorName: string | null }[];
};

const ACT_ICON: Record<string, React.ElementType> = {
  note: StickyNote, stage_change: GitCommitHorizontal, assignment: UserCheck, escalation: Zap, field_edit: FilePen, message: MessageCircle,
  payment: CircleDollarSign, appointment: CalendarDays, acknowledgement: CheckCircle2, lead: Zap, opportunity: ArrowRightLeft, created: Plus, ai: Sparkles,
};

export function ContactDetail({ v, pipelines, companies, team, me, can, intent }: {
  v: V; pipelines: { id: string; name: string }[]; companies: { id: string; name: string }[]; team: { id: string; name: string; timezone: string; calendar: string | null }[];
  me: { id: string; timezone: string }; can: { edit: boolean; del: boolean; create: boolean; value: boolean }; intent: { pay?: string; book?: string };
}) {
  const c = v.contact;
  const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Delete ${name} and their opportunities, conversations and appointments? This can't be undone.`)) return;
    start(async () => { const r = await deleteContactAction(c.id); r.ok ? (toast.success("Contact deleted"), router.push("/contacts")) : toast.error(r.error); });
  };

  return (
    <div className="pb-16">
      {/* header */}
      <header className="relative overflow-hidden border-b border-hairline px-4 pb-6 pt-8 sm:px-8">
        <div className="pointer-events-none absolute -right-20 -top-40 size-96 rounded-full bg-signal/[0.06] blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={name} className="size-16 text-lg" />
            <div>
              <h1 className="font-display text-4xl leading-none md:text-5xl">{name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {v.company && <span>{v.company.name}</span>}
                {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="size-3.5" />{c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="size-3.5" />{c.email}</a>}
                {c.optedOut && <span className="flex items-center gap-1 text-ember"><MessageCircleOff className="size-3.5" />Opted out of messages</span>}
              </div>
              {c.tags.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{c.tags.map((t) => <span key={t} className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface/60 px-4 py-3">
            <span className="text-xs text-muted-foreground">Assigned to</span>
            {v.owner?.name ? <span className="flex items-center gap-2 text-sm"><Avatar name={v.owner.name} />{v.owner.name}{v.owner.status && <StatusDot status={v.owner.status} />}</span> : <span className="text-sm text-ember">Nobody</span>}
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-4 pt-6 sm:px-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <ConversationPanel contactId={c.id} optedOut={c.optedOut} hasPhone={!!c.phone} conversations={v.conversations} />
          <Timeline contactId={c.id} activities={v.activities} canNote={can.edit} />
        </div>
        <aside className="space-y-6">
          <Details v={v} companies={companies} can={can} />
          <Section title="Leads" icon={Zap}>
            {v.leads.length ? v.leads.map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-accent">
                <span className="flex items-center gap-2"><SourceBadge source={l.source} /> <span className="capitalize text-muted-foreground">{l.status}</span></span>
                <span className="text-xs text-muted-foreground">{relative(l.createdAt)}</span>
              </Link>
            )) : <Empty>No leads.</Empty>}
          </Section>
          <Section title="Opportunities" icon={ArrowRightLeft} action={can.create && pipelines.length ? <NewOpp contactId={c.id} pipelines={pipelines} canValue={can.value} /> : null}>
            {v.opportunities.length ? v.opportunities.map((o) => (
              <Link key={o.id} href={`/pipeline`} className="block rounded-xl px-3 py-2.5 hover:bg-accent">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{o.title}</span>
                  <span className="font-mono text-sm tabular">{o.valueMasked ? "••••" : money(o.valueCents, o.currency)}</span></div>
                <p className="mt-0.5 text-xs text-muted-foreground">{o.pipelineName} · <span className={o.stageKind === "won" ? "text-ok" : o.stageKind === "lost" ? "" : "text-signal"}>{o.stageName}</span>{o.ownerName && ` · ${o.ownerName}`}</p>
              </Link>
            )) : <Empty>No opportunities yet.</Empty>}
          </Section>
          <PaymentsPanel contactId={c.id} payments={v.payments} opportunities={v.opportunities} canValue={can.value} openFor={intent.pay} />
          <AppointmentsPanel contactId={c.id} appointments={v.appointments} opportunities={v.opportunities} team={team} me={me} openFor={intent.book} />
          {can.del && <button onClick={remove} disabled={pending} className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline"><Trash2 className="size-4" /> Delete contact</button>}
        </aside>
      </div>
    </div>
  );
}

export function Section({ title, icon: I, action, children }: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="edge rounded-2xl p-2" aria-label={title}>
      <header className="flex items-center justify-between px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-medium"><I className="size-4 text-muted-foreground" />{title}</h2>{action}
      </header>
      <div>{children}</div>
    </section>
  );
}
export const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-3 pb-3 pt-1 text-sm text-muted-foreground">{children}</p>;

function Details({ v, companies, can }: { v: V; companies: { id: string; name: string }[]; can: { edit: boolean } }) {
  const c = v.contact;
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (f: FormData) => start(async () => {
    const r = await updateContactAction(c.id, c.version, {
      firstName: f.get("firstName"), lastName: f.get("lastName") ?? "", email: f.get("email") ?? "", phone: f.get("phone") ?? "", companyId: f.get("companyId") ?? "",
      tags: String(f.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean), optedOut: f.get("optedOut") === "on", custom: readCustom(f),
    });
    if (!r.ok) { setErrors((r.details as Record<string, string>) ?? {}); toast.error(r.error); return; }
    toast.success("Contact updated"); setEditing(false); router.refresh();
  });
  const input = "h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-signal/60";
  return (
    <Section title="Details" icon={FilePen} action={can.edit && !editing ? <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button> : null}>
      {!editing ? (
        <dl className="space-y-0.5 px-3 pb-2 text-sm">
          {v.fields.length === 0 && <p className="py-1 text-muted-foreground">No custom fields yet — an Admin can add them in Pipelines &amp; fields.</p>}
          {v.fields.map((f) => (
            <div key={f.id} className="flex justify-between gap-4 py-1.5">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-right">{c.custom[f.key] === undefined ? "—" : f.type === "checkbox" ? (c.custom[f.key] ? "Yes" : "No") : String(c.custom[f.key])}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-1.5"><dt className="text-muted-foreground">Added</dt><dd>{dateTime(c.createdAt)}</dd></div>
        </dl>
      ) : (
        <form key={c.version} action={save} className="space-y-3 px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="d-fn" className="mb-1 block text-xs">First name</label><input id="d-fn" name="firstName" defaultValue={c.firstName} className={input} />{errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}</div>
            <div><label htmlFor="d-ln" className="mb-1 block text-xs">Last name</label><input id="d-ln" name="lastName" defaultValue={c.lastName ?? ""} className={input} /></div>
          </div>
          <div><label htmlFor="d-ph" className="mb-1 block text-xs">Phone</label><input id="d-ph" name="phone" defaultValue={c.phone ?? ""} className={input} />{errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}</div>
          <div><label htmlFor="d-em" className="mb-1 block text-xs">Email</label><input id="d-em" name="email" defaultValue={c.email ?? ""} className={input} />{errors.email && <p className="text-xs text-destructive">{errors.email}</p>}</div>
          <div><label htmlFor="d-co" className="mb-1 block text-xs">Company</label>
            <select id="d-co" name="companyId" defaultValue={c.companyId ?? ""} className={input}><option value="">—</option>{companies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label htmlFor="d-tg" className="mb-1 block text-xs">Tags (comma separated)</label><input id="d-tg" name="tags" defaultValue={c.tags.join(", ")} className={input} /></div>
          {v.fields.map((f) => <CustomFieldInput key={f.id} f={f} value={c.custom[f.key]} error={errors[f.key]} />)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optedOut" defaultChecked={c.optedOut} className="size-4 accent-[var(--signal)]" /> Opted out of messages</label>
          <div className="flex gap-2">
            <button disabled={pending} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60">{pending && <Loader2 className="size-4 animate-spin" />}Save</button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border border-input px-3 text-sm">Cancel</button>
          </div>
        </form>
      )}
    </Section>
  );
}

function Timeline({ contactId, activities, canNote }: { contactId: string; activities: V["activities"]; canNote: boolean }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = () => start(async () => {
    const r = await addNoteAction(contactId, note);
    if (!r.ok) { toast.error(r.error); return; }
    setNote(""); router.refresh();
  });
  return (
    <Section title="Activity" icon={Clock}>
      {canNote && (
        <div className="mx-3 mb-3 rounded-xl border border-input bg-background focus-within:border-signal/60">
          <label htmlFor="note" className="sr-only">Add a note</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note… (counts as acknowledging their lead)"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) submit(); }}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground/60" />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="px-1 text-[11px] text-muted-foreground">Ctrl + Enter to save</span>
            <button onClick={submit} disabled={pending || !note.trim()} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-medium text-background disabled:opacity-40">
              {pending && <Loader2 className="size-3 animate-spin" />}Save note</button>
          </div>
        </div>
      )}
      <ol className="relative px-3 pb-2">
        <span className="absolute bottom-4 left-[1.6rem] top-2 w-px bg-hairline" aria-hidden />
        {activities.map((a, i) => {
          const I = ACT_ICON[a.type] ?? GitCommitHorizontal;
          return (
            <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="relative flex gap-3 py-2.5">
              <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-hairline bg-surface ${a.type === "escalation" ? "text-ember" : a.type === "note" ? "text-signal" : "text-muted-foreground"}`}><I className="size-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${a.type === "note" ? "whitespace-pre-wrap rounded-lg bg-surface px-3 py-2" : ""}`}>{a.summary}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{a.actorName ?? "System"} · <time dateTime={a.createdAt} title={dateTime(a.createdAt)}>{relative(a.createdAt)}</time></p>
              </div>
            </motion.li>
          );
        })}
        {!activities.length && <Empty>No activity yet.</Empty>}
      </ol>
    </Section>
  );
}

function NewOpp({ contactId, pipelines, canValue }: { contactId: string; pipelines: { id: string; name: string }[]; canValue: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (f: FormData) => start(async () => {
    const r = await createOpportunityAction({ contactId, pipelineId: f.get("pipelineId"), title: f.get("title"), ...(canValue && f.get("value") ? { value: f.get("value") } : {}) });
    if (!r.ok) { toast.error(r.error); return; }
    setOpen(false); toast.success("Opportunity created"); router.refresh();
  });
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground">+ New</button>;
  return (
    <form action={submit} className="absolute inset-x-2 top-11 z-10 space-y-2 rounded-xl border border-hairline bg-popover p-3 shadow-2xl">
      <select name="pipelineId" aria-label="Pipeline" className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <input name="title" aria-label="Title" required placeholder="Title" className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm" />
      {canValue && <input name="value" aria-label="Value" type="number" min="0" step="0.01" placeholder="Value" className="h-9 w-full rounded-lg border border-input bg-surface px-3 font-mono text-sm" />}
      <div className="flex gap-2"><button disabled={pending} className="h-8 flex-1 rounded-lg bg-signal text-xs font-medium text-signal-foreground">Create</button>
        <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg border border-input px-3 text-xs">Cancel</button></div>
    </form>
  );
}

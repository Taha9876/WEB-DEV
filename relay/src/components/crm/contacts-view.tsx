"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { BookmarkPlus, ChevronLeft, ChevronRight, Contact2, Download, Filter as FilterIcon, Loader2, MessageCircleOff, Plus, X } from "lucide-react";
import { PageHeader, EmptyState, Avatar } from "@/components/app/primitives";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/leads/new-lead-dialog";
import { CustomFieldInput, readCustom, type FieldDef } from "./custom-field-input";
import { createContactAction, deleteSavedListAction, saveListAction } from "@/app/(app)/_actions/crm";
import { relative } from "@/lib/format";

type Row = { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; tags: string[]; optedOut: boolean;
  companyName: string | null; ownerName: string | null; openOpps: number; createdAt: number; custom: Record<string, unknown> };
type Opt = { id: string; name: string };
type F = { field: string; value: string };

const FIELD_LABEL: Record<string, string> = { q: "Search", owner: "Owner", tag: "Tag", stage: "Stage", source: "Lead source", created_after: "Created after", created_before: "Created before" };

export function ContactsView(p: {
  rows: Row[]; total: number; page: number; filters: F[]; lists: Opt[]; activeList: string | null; fields: FieldDef[];
  team: Opt[]; companies: Opt[]; stages: Opt[]; tags: string[]; can: { create: boolean; export: boolean; viewAll: boolean };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<F[]>(p.filters.length ? p.filters : [{ field: "q", value: "" }]);
  const [pending, start] = useTransition();
  const apply = (fs: F[]) => {
    const qs = new URLSearchParams(fs.filter((f) => f.value).map((f) => [f.field, f.value]));
    router.push(`/contacts?${qs}`);
  };
  const saveList = () => {
    const name = prompt("Name this list (it updates automatically as records change):");
    if (!name) return;
    start(async () => {
      const r = await saveListAction(name, "contacts", draft.filter((f) => f.value));
      r.ok ? (toast.success(`Saved "${name}"`), router.push(`/contacts?list=${(r.data as { id: string }).id}`)) : toast.error(r.error);
    });
  };
  const pages = Math.max(1, Math.ceil(p.total / 50));
  const options = (field: string): Opt[] | null => {
    if (field === "owner") return [{ id: "me", name: "Me" }, { id: "none", name: "Unassigned" }, ...p.team];
    if (field === "stage") return p.stages;
    if (field === "tag") return p.tags.map((t) => ({ id: t, name: t }));
    if (field === "source") return [["web_form", "Web form"], ["whatsapp", "WhatsApp"], ["manual", "Manual"]].map(([id, name]) => ({ id, name }));
    const cf = p.fields.find((f) => `custom:${f.key}` === field);
    if (cf?.type === "dropdown") return cf.options.map((o) => ({ id: o, name: o }));
    if (cf?.type === "checkbox") return [{ id: "true", name: "Yes" }, { id: "false", name: "No" }];
    return null;
  };

  return (
    <div>
      <PageHeader title="Contacts" description={`${p.total} ${p.total === 1 ? "contact" : "contacts"}${p.can.viewAll ? "" : " you own"}. Combine filters and save them as a live list.`}>
        {p.can.export && <a href={`/api/export/contacts?filters=${encodeURIComponent(JSON.stringify(p.filters))}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-accent"><Download className="size-4" /> Export CSV</a>}
        {p.can.create && <NewContact fields={p.fields} companies={p.companies} />}
      </PageHeader>

      <div className="flex gap-1 overflow-x-auto border-b border-hairline px-4 sm:px-8" role="tablist" aria-label="Saved lists">
        <Link href="/contacts" role="tab" aria-selected={!p.activeList} className={`relative whitespace-nowrap px-3 py-3 text-sm ${!p.activeList ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          All contacts {!p.activeList && <motion.span layoutId="list-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />}
        </Link>
        {p.lists.map((l) => (
          <span key={l.id} className="group relative flex items-center">
            <Link href={`/contacts?list=${l.id}`} role="tab" aria-selected={p.activeList === l.id} className={`whitespace-nowrap px-3 py-3 text-sm ${p.activeList === l.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {l.name} {p.activeList === l.id && <motion.span layoutId="list-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />}
            </Link>
            <button aria-label={`Delete list ${l.name}`} onClick={() => start(async () => { const r = await deleteSavedListAction(l.id); r.ok ? router.push("/contacts") : toast.error(r.error); })}
              className="-ml-2 mr-1 grid size-5 place-items-center rounded opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100"><X className="size-3" /></button>
          </span>
        ))}
      </div>

      {/* filter builder */}
      <div className="space-y-2 border-b border-hairline bg-surface/40 px-4 py-4 sm:px-8">
        {draft.map((f, i) => {
          const opts = options(f.field);
          const cf = p.fields.find((x) => `custom:${x.key}` === f.field);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <FilterIcon className="size-4 text-muted-foreground" aria-hidden />
              <select aria-label="Filter field" value={f.field} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { field: e.target.value, value: "" } : x)))}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
                {Object.entries(FIELD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                {p.fields.map((x) => <option key={x.key} value={`custom:${x.key}`}>{x.label}</option>)}
              </select>
              {opts ? (
                <select aria-label="Filter value" value={f.value} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  className="h-9 min-w-40 rounded-lg border border-input bg-background px-2 text-sm"><option value="">Any</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
              ) : (
                <input aria-label="Filter value" type={f.field.startsWith("created_") || cf?.type === "date" ? "date" : cf?.type === "number" ? "number" : "text"} value={f.value}
                  onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} onKeyDown={(e) => e.key === "Enter" && apply(draft)}
                  placeholder={f.field === "q" ? "Name, email or phone" : ""} className="h-9 min-w-40 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-signal/60" />
              )}
              {draft.length > 1 && <button aria-label="Remove filter" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><X className="size-4" /></button>}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => setDraft((d) => [...d, { field: "owner", value: "" }])} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-3.5" /> Add filter</button>
          <button onClick={() => apply(draft)} className="h-8 rounded-lg bg-foreground px-3 text-sm font-medium text-background">Apply</button>
          <button onClick={saveList} disabled={pending || !draft.some((f) => f.value)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-accent disabled:opacity-40">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <BookmarkPlus className="size-3.5" />} Save as list</button>
        </div>
      </div>

      {p.rows.length === 0 ? <EmptyState icon={Contact2} title="No matching contacts" body="Try removing a filter, or create a contact." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-hairline text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-normal sm:px-8">Name</th><th className="px-3 py-2.5 font-normal">Company</th><th className="px-3 py-2.5 font-normal">Owner</th>
              <th className="px-3 py-2.5 font-normal">Tags</th><th className="px-3 py-2.5 text-right font-normal">Open deals</th><th className="px-4 py-2.5 text-right font-normal sm:px-8">Added</th></tr></thead>
            <tbody>
              {p.rows.map((r, i) => (
                <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 15) * 0.015 }}
                  onClick={() => router.push(`/contacts/${r.id}`)} className="cursor-pointer border-b border-hairline transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3 sm:px-8">
                    <Link href={`/contacts/${r.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-3">
                      <Avatar name={`${r.firstName} ${r.lastName ?? ""}`} className="size-8 text-[11px]" />
                      <span><span className="font-medium">{r.firstName} {r.lastName}</span>
                        <span className="block text-xs text-muted-foreground">{r.phone ?? r.email ?? "—"}</span></span>
                      {r.optedOut && <MessageCircleOff className="size-3.5 text-muted-foreground" aria-label="Opted out of messages" />}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{r.companyName ?? "—"}</td>
                  <td className="px-3 py-3">{r.ownerName ? <span className="flex items-center gap-2"><Avatar name={r.ownerName} className="size-5 text-[8px]" />{r.ownerName}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}</div></td>
                  <td className="px-3 py-3 text-right font-mono tabular">{r.openOpps}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground sm:px-8">{relative(r.createdAt)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-4 text-sm text-muted-foreground sm:px-8">
          <span>Page {p.page} of {pages}</span>
          <div className="flex gap-1">
            {p.page > 1 && <Link aria-label="Previous page" href={`?${new URLSearchParams({ ...Object.fromEntries(p.filters.map((f) => [f.field, f.value])), p: String(p.page - 1) })}`} className="grid size-8 place-items-center rounded-lg hover:bg-accent"><ChevronLeft className="size-4" /></Link>}
            {p.page < pages && <Link aria-label="Next page" href={`?${new URLSearchParams({ ...Object.fromEntries(p.filters.map((f) => [f.field, f.value])), p: String(p.page + 1) })}`} className="grid size-8 place-items-center rounded-lg hover:bg-accent"><ChevronRight className="size-4" /></Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function NewContact({ fields, companies }: { fields: FieldDef[]; companies: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (f: FormData) => start(async () => {
    const r = await createContactAction({
      firstName: f.get("firstName"), lastName: f.get("lastName") || undefined, email: f.get("email") || undefined, phone: f.get("phone") || undefined,
      companyId: f.get("companyId") || undefined, tags: String(f.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean), custom: readCustom(f),
    });
    if (!r.ok) { setErrors((r.details as Record<string, string>) ?? {}); toast.error(r.error); return; }
    setOpen(false); toast.success("Contact created"); router.push(`/contacts/${(r.data as { id: string }).id}`);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-sm font-medium text-signal-foreground"><Plus className="size-4" /> New contact</button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-3xl font-normal">New contact</DialogTitle><DialogDescription>Custom fields configured by your Admin appear below.</DialogDescription></DialogHeader>
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <Field name="firstName" label="First name" required error={errors.firstName} />
          <Field name="lastName" label="Last name" error={errors.lastName} />
          <Field name="phone" label="Phone" placeholder="+923001234567" error={errors.phone} />
          <Field name="email" label="Email" type="email" error={errors.email} />
          <div><label htmlFor="nc-company" className="mb-1.5 block text-sm">Company</label>
            <select id="nc-company" name="companyId" className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <Field name="tags" label="Tags" placeholder="vip, solar" />
          {fields.map((f) => <div key={f.id} className="sm:col-span-2"><CustomFieldInput f={f} value={undefined} error={errors[f.key]} /></div>)}
          <button disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60 sm:col-span-2">{pending && <Loader2 className="size-4 animate-spin" />} Create contact</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { BadgeCheck, Download, Loader2, Lock, Plus, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar } from "@/components/app/primitives";
import { money } from "@/lib/format";
import { CustomFieldInput, readCustom, type FieldDef } from "./custom-field-input";
import { createOpportunityAction, deleteOpportunityAction, moveOpportunityAction, updateOpportunityAction } from "@/app/(app)/_actions/crm";
import { OppActions } from "./opp-actions";

type Stage = { id: string; name: string; kind: "open" | "won" | "lost"; requiredFieldIds: string[] };
type Card = {
  id: string; title: string; valueCents: number | null; valueMasked: boolean; currency: string; stageId: string; custom: Record<string, unknown>;
  version: number; ownerName: string | null; ownerId: string | null; contactId: string; contactName: string; updatedAt: number; paid: boolean;
};
type Can = { create: boolean; edit: boolean; del: boolean; value: boolean; export: boolean; viewAll: boolean };

export function Board(p: {
  pipelines: { id: string; name: string }[]; pipeline: { id: string; name: string; stages: Stage[] }; cards: Card[]; fields: FieldDef[];
  contacts: { id: string; name: string }[]; team: { id: string; name: string }[]; can: Can; q: string; owner: string;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(p.cards);
  useEffect(() => setCards(p.cards), [p.cards]); // realtime refresh replaces local state
  const [dragging, setDragging] = useState<Card | null>(null);
  const [open, setOpen] = useState<{ card: Card; missing?: string[]; targetStage?: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const byStage = useMemo(() => Object.fromEntries(p.pipeline.stages.map((s) => [s.id, cards.filter((c) => c.stageId === s.id)])), [cards, p.pipeline.stages]);

  const onStart = (e: DragStartEvent) => setDragging(cards.find((c) => c.id === e.active.id) ?? null);
  const onEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const card = cards.find((c) => c.id === e.active.id), to = e.over?.id as string | undefined;
    if (!card || !to || card.stageId === to) return;
    move(card, to);
  };
  const move = async (card: Card, to: string) => {
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stageId: to } : c))); // optimistic
    const r = await moveOpportunityAction(card.id, to, card.version);
    if (!r.ok) {
      setCards(prev);
      const missing = (r.details as { missing?: string[] } | undefined)?.missing;
      if (missing) { toast.error(r.error, { description: "Fill the highlighted fields — the move completes when you save." }); setOpen({ card, missing, targetStage: to }); }
      else toast.error(r.error);
      return;
    }
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, version: (r.data as { version: number }).version } : c)));
    toast.success(`Moved to ${p.pipeline.stages.find((s) => s.id === to)?.name}`);
  };

  return (
    <div className="flex h-dvh flex-col lg:h-dvh">
      <div className="flex flex-col gap-4 border-b border-hairline px-4 pb-5 pt-8 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-4xl leading-none md:text-5xl">{p.pipeline.name}</h1>
            {p.pipelines.length > 1 && (
              <select aria-label="Switch pipeline" value={p.pipeline.id} onChange={(e) => router.push(`/pipeline?p=${e.target.value}`)}
                className="h-8 rounded-lg border border-input bg-surface px-2 text-sm">
                {p.pipelines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Drag cards between stages. Stages with required fields won&apos;t accept a card until they&apos;re filled.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative" action={(f) => router.push(`/pipeline?p=${p.pipeline.id}&q=${encodeURIComponent(String(f.get("q") ?? ""))}&owner=${p.owner}`)}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={p.q} placeholder="Search deals" aria-label="Search deals" className="h-9 w-44 rounded-lg border border-input bg-surface pl-8 pr-3 text-sm outline-none focus:border-signal/60" />
          </form>
          {p.can.viewAll && (
            <select aria-label="Filter by owner" value={p.owner} onChange={(e) => router.push(`/pipeline?p=${p.pipeline.id}&q=${encodeURIComponent(p.q)}&owner=${e.target.value}`)}
              className="h-9 rounded-lg border border-input bg-surface px-2 text-sm">
              <option value="">Everyone</option><option value="me">Me</option>
              {p.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {p.can.export && <a href={`/api/export/opportunities?pipeline=${p.pipeline.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-accent"><Download className="size-4" /> Export</a>}
          {p.can.create && <NewOpportunity pipelineId={p.pipeline.id} contacts={p.contacts} canValue={p.can.value} />}
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
        <div className="flex flex-1 gap-3 overflow-x-auto p-4 sm:px-8" role="list" aria-label="Stages">
          {p.pipeline.stages.map((s) => (
            <Column key={s.id} stage={s} cards={byStage[s.id] ?? []} fields={p.fields} canValue={p.can.value}
              onOpen={(c) => setOpen({ card: c })} canEdit={p.can.edit} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 280, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
          {dragging && <CardView c={dragging} lifted />}
        </DragOverlay>
      </DndContext>

      <OppSheet state={open} onClose={() => setOpen(null)} stages={p.pipeline.stages} fields={p.fields} team={p.team} can={p.can}
        onSaved={(c, moveTo) => { setOpen(null); if (moveTo) move(c, moveTo); else router.refresh(); }} />
    </div>
  );
}

function Column({ stage, cards, onOpen, canEdit, fields, canValue }: { stage: Stage; cards: Card[]; onOpen: (c: Card) => void; canEdit: boolean; fields: FieldDef[]; canValue: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !canEdit });
  const total = cards.reduce((a, c) => a + (c.valueCents ?? 0), 0);
  const req = fields.filter((f) => stage.requiredFieldIds.includes(f.id));
  return (
    <section ref={setNodeRef} role="listitem" aria-label={`${stage.name}, ${cards.length} deals`}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border transition-colors duration-200 ${isOver ? "border-signal/50 bg-signal/[0.04]" : "border-hairline bg-surface/40"}`}>
      <header className="px-3.5 pb-2 pt-3.5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <span className={`size-2 rounded-full ${stage.kind === "won" ? "bg-ok" : stage.kind === "lost" ? "bg-idle" : "bg-signal"}`} aria-hidden />
            {stage.name}<span className="font-normal text-muted-foreground">{cards.length}</span>
          </h2>
          <span className="font-mono text-xs text-muted-foreground tabular">{canValue ? money(total, cards[0]?.currency ?? "USD", true) : "••••"}</span>
        </div>
        {req.length > 0 && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="size-3" /> Requires {req.map((r) => r.label).join(", ")}</p>}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        <AnimatePresence initial={false}>
          {cards.map((c) => <Draggable key={c.id} c={c} onOpen={() => onOpen(c)} disabled={!canEdit} />)}
        </AnimatePresence>
        {!cards.length && <p className="rounded-xl border border-dashed border-hairline px-3 py-6 text-center text-xs text-muted-foreground">Drop deals here</p>}
      </div>
    </section>
  );
}

function Draggable({ c, onOpen, disabled }: { c: Card; onOpen: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, disabled });
  return (
    <motion.div layout layoutId={c.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: isDragging ? 0.35 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}>
      <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); listeners?.onKeyDown?.(e); }}
        aria-roledescription="Draggable deal. Press space to pick up, arrows to move, space to drop. Enter to open." className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardView c={c} />
      </div>
    </motion.div>
  );
}

function CardView({ c, lifted }: { c: Card; lifted?: boolean }) {
  return (
    <div className={`edge cursor-grab rounded-xl p-3 active:cursor-grabbing ${lifted ? "rotate-[1.5deg] shadow-2xl ring-1 ring-signal/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{c.title}</p>
        {c.paid && <BadgeCheck className="size-4 shrink-0 text-ok" aria-label="Paid" />}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.contactName}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm tabular" title={c.valueMasked ? "You don't have permission to see values" : undefined}>
          {c.valueMasked ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="size-3" />Hidden</span> : money(c.valueCents, c.currency)}
        </span>
        <Avatar name={c.ownerName} className="size-6 text-[9px]" />
      </div>
    </div>
  );
}

function OppSheet({ state, onClose, stages, fields, team, can, onSaved }: {
  state: { card: Card; missing?: string[]; targetStage?: string } | null; onClose: () => void; stages: Stage[]; fields: FieldDef[];
  team: { id: string; name: string }[]; can: Can; onSaved: (c: Card, moveTo?: string) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const c = state?.card;
  const target = stages.find((s) => s.id === state?.targetStage);
  useEffect(() => setErrors(Object.fromEntries((state?.missing ?? []).map((k) => [k, `Required for ${target?.name ?? "this stage"}`]))), [state, target?.name]);

  const save = (form: FormData) => start(async () => {
    if (!c) return;
    const value = form.get("value");
    const r = await updateOpportunityAction(c.id, c.version, {
      title: form.get("title"), ownerId: form.get("ownerId") || undefined, custom: readCustom(form),
      ...(can.value && value !== null && value !== "" ? { value } : {}),
    });
    if (!r.ok) { setErrors((r.details as Record<string, string>) ?? {}); toast.error(r.error); return; }
    toast.success("Saved");
    onSaved({ ...c, version: (r.data as { version: number }).version }, state?.targetStage);
  });
  const remove = () => start(async () => {
    if (!c || !confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    const r = await deleteOpportunityAction(c.id);
    r.ok ? (toast.success("Deleted"), onSaved(c)) : toast.error(r.error);
  });

  return (
    <Sheet open={!!state} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {c && <>
          <SheetHeader>
            <SheetTitle className="font-display text-3xl font-normal">{c.title}</SheetTitle>
            <SheetDescription><Link href={`/contacts/${c.contactId}`} className="underline-offset-4 hover:underline">{c.contactName}</Link> · {stages.find((s) => s.id === c.stageId)?.name}</SheetDescription>
          </SheetHeader>
          {target && <p role="status" className="mx-4 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">Fill the fields below to move this deal to <b>{target.name}</b>.</p>}
          <form key={c.id + c.version} action={save} className="space-y-4 px-4 pb-6">
            <div><label htmlFor="o-title" className="mb-1.5 block text-sm">Title</label>
              <input id="o-title" name="title" defaultValue={c.title} disabled={!can.edit} className="h-10 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none focus:border-signal/60" /></div>
            <div><label htmlFor="o-value" className="mb-1.5 block text-sm">Value ({c.currency})</label>
              {c.valueMasked
                ? <p className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-hairline px-3.5 text-sm text-muted-foreground"><Lock className="size-3.5" /> Hidden — your role can&apos;t see deal values</p>
                : <input id="o-value" name="value" type="number" min="0" step="0.01" defaultValue={c.valueCents != null ? c.valueCents / 100 : ""} disabled={!can.edit}
                    className="h-10 w-full rounded-xl border border-input bg-surface px-3.5 font-mono text-sm outline-none focus:border-signal/60" />}</div>
            <div><label htmlFor="o-owner" className="mb-1.5 block text-sm">Owner</label>
              <select id="o-owner" name="ownerId" defaultValue={c.ownerId ?? ""} disabled={!can.edit} className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm">
                {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            {fields.map((f) => {
              const req = stages.filter((s) => s.requiredFieldIds.includes(f.id)).map((s) => s.name);
              return <CustomFieldInput key={f.id} f={f} value={c.custom[f.key]} error={errors[f.key]} hint={req.length ? `Required for ${req.join(", ")}` : undefined} />;
            })}
            {can.edit && <button disabled={pending} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60">
              {pending && <Loader2 className="size-4 animate-spin" />} {target ? `Save & move to ${target.name}` : "Save changes"}</button>}
          </form>
          <OppActions opportunityId={c.id} contactId={c.contactId} />
          {can.del && <button onClick={remove} className="mx-4 mb-6 inline-flex items-center gap-1.5 text-sm text-destructive hover:underline"><Trash2 className="size-4" /> Delete opportunity</button>}
        </>}
      </SheetContent>
    </Sheet>
  );
}

function NewOpportunity({ pipelineId, contacts, canValue }: { pipelineId: string; contacts: { id: string; name: string }[]; canValue: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const submit = (f: FormData) => start(async () => {
    const r = await createOpportunityAction({ pipelineId, contactId: f.get("contactId"), title: f.get("title"), ...(canValue && f.get("value") ? { value: f.get("value") } : {}) });
    if (!r.ok) { setErrors((r.details as Record<string, string>) ?? {}); toast.error(r.error); return; }
    setOpen(false); toast.success("Opportunity created"); router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-sm font-medium text-signal-foreground"><Plus className="size-4" /> New deal</button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display text-3xl font-normal">New opportunity</DialogTitle><DialogDescription>Starts in the first stage of this pipeline.</DialogDescription></DialogHeader>
        <form action={submit} className="space-y-4">
          <div><label htmlFor="no-contact" className="mb-1.5 block text-sm">Contact</label>
            <select id="no-contact" name="contactId" required className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm">
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            {errors.contactId && <p className="mt-1 text-xs text-destructive">{errors.contactId}</p>}</div>
          <div><label htmlFor="no-title" className="mb-1.5 block text-sm">Title</label>
            <input id="no-title" name="title" required placeholder="10kW rooftop system" className="h-10 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none focus:border-signal/60" />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}</div>
          {canValue && <div><label htmlFor="no-value" className="mb-1.5 block text-sm">Value (USD)</label>
            <input id="no-value" name="value" type="number" min="0" step="0.01" className="h-10 w-full rounded-xl border border-input bg-surface px-3.5 font-mono text-sm outline-none focus:border-signal/60" /></div>}
          <button disabled={pending} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60">{pending && <Loader2 className="size-4 animate-spin" />} Create</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

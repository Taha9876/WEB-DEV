"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/primitives";
import * as C from "@/app/(app)/_actions/config";

type Stage = { id: string; name: string; kind: "open" | "won" | "lost"; requiredFieldIds: string[]; count: number };
type Pipe = { id: string; name: string; stages: Stage[] };
type Field = { id: string; key: string; label: string; type: string; options: string[]; entity: "contact" | "company" | "opportunity"; pipelineId: string | null };
type R = { ok: boolean; error?: string; details?: unknown };

const TYPES = ["text", "number", "date", "dropdown", "checkbox"] as const;

export function ConfigView({ pipelines, fields }: { pipelines: Pipe[]; fields: Field[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [pid, setPid] = useState(pipelines[0]?.id ?? "");
  const pipe = pipelines.find((p) => p.id === pid) ?? pipelines[0];
  const run = (p: Promise<R>, ok?: string, after?: (r: R) => void) => start(async () => {
    const r = await p;
    if (!r.ok) { toast.error(r.error); after?.(r); return; }
    if (ok) toast.success(ok);
    router.refresh();
  });

  const move = (i: number, d: -1 | 1) => {
    const ids = pipe.stages.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(C.reorderStagesAction(pipe.id, ids));
  };
  const delStage = (s: Stage) => {
    if (s.count === 0) return confirm(`Delete stage "${s.name}"?`) && run(C.deleteStageAction(s.id), "Stage deleted");
    const others = pipe.stages.filter((x) => x.id !== s.id);
    const pick = prompt(`"${s.name}" has ${s.count} opportunit${s.count === 1 ? "y" : "ies"}. Move them to which stage?\n\n${others.map((o, i) => `${i + 1}. ${o.name}`).join("\n")}\n\nType the number:`);
    const target = others[Number(pick) - 1];
    if (target) run(C.deleteStageAction(s.id, target.id), `Moved ${s.count} to ${target.name} and deleted "${s.name}"`);
  };
  const oppFields = fields.filter((f) => f.entity === "opportunity" && (!f.pipelineId || f.pipelineId === pipe?.id));

  return (
    <div className="pb-16">
      <PageHeader title={<>Pipelines &amp; <em>fields</em></>} description="Shape the CRM to how your team actually sells — no developer needed. Changes apply instantly on every form and board." />

      <div className="grid gap-8 px-4 pt-6 sm:px-8 xl:grid-cols-2">
        {/* ---------------- pipelines & stages */}
        <section aria-labelledby="pipes-h">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 id="pipes-h" className="mr-auto font-display text-3xl">Stages</h2>
            <select aria-label="Pipeline" value={pipe?.id} onChange={(e) => setPid(e.target.value)} className="h-9 rounded-lg border border-input bg-surface px-2 text-sm">
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button onClick={() => { const n = prompt("New pipeline name (e.g. Commercial installs)"); if (n) run(C.createPipelineAction(n), "Pipeline created"); }}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-input px-3 text-sm hover:bg-accent"><Plus className="size-4" /> Pipeline</button>
          </div>
          {pipe && (
            <div className="edge rounded-3xl p-3">
              <div className="flex items-center gap-2 px-2 pb-3">
                <input aria-label="Pipeline name" defaultValue={pipe.name} key={pipe.id} onBlur={(e) => e.target.value !== pipe.name && run(C.renamePipelineAction(pipe.id, e.target.value), "Renamed")}
                  className="flex-1 rounded-md bg-transparent px-1 text-lg font-medium outline-none focus:bg-background" />
              </div>
              <ol className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {pipe.stages.map((s, i) => (
                    <motion.li key={s.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl bg-background/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`size-2 rounded-full ${s.kind === "won" ? "bg-ok" : s.kind === "lost" ? "bg-idle" : "bg-signal"}`} aria-hidden />
                        <input aria-label={`Stage name ${s.name}`} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && run(C.updateStageAction(s.id, { name: e.target.value }), "Stage renamed")}
                          className="min-w-32 flex-1 rounded-md bg-transparent px-1 text-sm font-medium outline-none focus:bg-surface" />
                        <span className="text-xs text-muted-foreground">{s.count} deal{s.count === 1 ? "" : "s"}</span>
                        <select aria-label={`Kind of ${s.name}`} value={s.kind} onChange={(e) => run(C.updateStageAction(s.id, { kind: e.target.value }))} className="h-7 rounded-md border border-input bg-surface px-1.5 text-xs">
                          <option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select>
                        <button aria-label="Move up" disabled={i === 0 || pending} onClick={() => move(i, -1)} className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                        <button aria-label="Move down" disabled={i === pipe.stages.length - 1 || pending} onClick={() => move(i, 1)} className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                        <button aria-label={`Delete ${s.name}`} disabled={pending} onClick={() => delStage(s)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                      </div>
                      {oppFields.length > 0 && (
                        <fieldset className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
                          <legend className="sr-only">Required to enter {s.name}</legend>
                          <Lock className="size-3 text-muted-foreground" aria-hidden /><span className="mr-1 text-[11px] text-muted-foreground">Required to enter:</span>
                          {oppFields.map((f) => {
                            const on = s.requiredFieldIds.includes(f.id);
                            return (
                              <button key={f.id} aria-pressed={on} disabled={pending}
                                onClick={() => run(C.updateStageAction(s.id, { requiredFieldIds: on ? s.requiredFieldIds.filter((x) => x !== f.id) : [...s.requiredFieldIds, f.id] }))}
                                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? "border-ember/40 bg-ember/15 text-ember" : "border-hairline text-muted-foreground hover:text-foreground"}`}>{f.label}</button>
                            );
                          })}
                        </fieldset>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
              <form action={(f) => { const n = String(f.get("name") ?? "").trim(); if (n) run(C.addStageAction(pipe.id, n), "Stage added"); }} className="mt-2 flex gap-2 px-1">
                <input name="name" aria-label="New stage name" placeholder="Add a stage…" className="h-9 flex-1 rounded-lg border border-dashed border-input bg-transparent px-3 text-sm outline-none focus:border-signal/60" />
                <button disabled={pending} className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background">Add</button>
              </form>
            </div>
          )}
        </section>

        {/* ---------------- custom fields */}
        <section aria-labelledby="fields-h">
          <h2 id="fields-h" className="mb-4 font-display text-3xl">Custom fields</h2>
          <NewField pipelines={pipelines} onCreate={(input) => run(C.createFieldAction(input), "Field created — it's on every form now")} pending={pending} />
          {(["contact", "opportunity", "company"] as const).map((ent) => {
            const list = fields.filter((f) => f.entity === ent);
            return (
              <div key={ent} className="mt-6">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{ent === "contact" ? "Contacts" : ent === "company" ? "Companies" : "Opportunities"}</h3>
                {!list.length && <p className="text-sm text-muted-foreground">No fields yet.</p>}
                <ul className="space-y-1.5">
                  {list.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface/60 px-3 py-2.5 text-sm">
                      <span className="font-medium">{f.label}</span>
                      <code className="text-[11px] text-muted-foreground">{f.key}</code>
                      <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground">{f.type}</span>
                      {f.entity === "opportunity" && <span className="text-[11px] text-muted-foreground">{f.pipelineId ? `only ${pipelines.find((p) => p.id === f.pipelineId)?.name}` : "all pipelines"}</span>}
                      {f.type === "dropdown" && <span className="truncate text-[11px] text-muted-foreground">{f.options.join(" · ")}</span>}
                      <button aria-label={`Delete field ${f.label}`} disabled={pending} onClick={() => confirm(`Delete "${f.label}"? Its values are removed from every record.`) && run(C.deleteFieldAction(f.id), "Field deleted")}
                        className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function NewField({ pipelines, onCreate, pending }: { pipelines: Pipe[]; onCreate: (i: Record<string, unknown>) => void; pending: boolean }) {
  const [entity, setEntity] = useState("contact");
  const [type, setType] = useState("text");
  return (
    <form action={(f) => onCreate({ entity, type, label: f.get("label"), pipelineId: entity === "opportunity" && f.get("pipelineId") ? f.get("pipelineId") : null,
      options: type === "dropdown" ? String(f.get("options") ?? "").split(",").map((o) => o.trim()).filter(Boolean) : undefined })}
      className="edge grid gap-3 rounded-3xl p-4 sm:grid-cols-2">
      <div><label htmlFor="nf-label" className="mb-1 block text-xs">Field name</label>
        <input id="nf-label" name="label" required placeholder="e.g. Roof type" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-signal/60" /></div>
      <div><label htmlFor="nf-type" className="mb-1 block text-xs">Type</label>
        <select id="nf-type" value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div><label htmlFor="nf-entity" className="mb-1 block text-xs">Applies to</label>
        <select id="nf-entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
          <option value="contact">Contacts</option><option value="opportunity">Opportunities</option><option value="company">Companies</option></select></div>
      {entity === "opportunity" ? (
        <div><label htmlFor="nf-pipe" className="mb-1 block text-xs">Pipeline</label>
          <select id="nf-pipe" name="pipelineId" className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"><option value="">All pipelines</option>{pipelines.map((p) => <option key={p.id} value={p.id}>Only {p.name}</option>)}</select></div>
      ) : <div />}
      {type === "dropdown" && <div className="sm:col-span-2"><label htmlFor="nf-opts" className="mb-1 block text-xs">Options (comma separated)</label>
        <input id="nf-opts" name="options" required placeholder="Flat, Pitched, Metal" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-signal/60" /></div>}
      <button disabled={pending} className="h-9 rounded-lg bg-signal text-sm font-medium text-signal-foreground disabled:opacity-60 sm:col-span-2">Add field</button>
    </form>
  );
}

"use client";

export type FieldDef = { id: string; key: string; label: string; type: "text" | "number" | "date" | "dropdown" | "checkbox"; options: string[]; pipelineId: string | null };

const base = "h-10 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none transition-colors focus:border-signal/60 aria-invalid:border-destructive/60";

/** Renders any custom field from its definition — fields created in Settings appear here immediately (F2.2). */
export function CustomFieldInput({ f, value, error, hint }: { f: FieldDef; value: unknown; error?: string; hint?: string }) {
  const id = `cf-${f.key}`;
  const describedBy = [error && `${id}-e`, hint && `${id}-h`].filter(Boolean).join(" ") || undefined;
  if (f.type === "checkbox")
    return (
      <div>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="hidden" name={`custom.${f.key}`} value="false" />
          <input id={id} type="checkbox" name={`custom.${f.key}`} value="true" defaultChecked={value === true}
            className="size-4 rounded border-input accent-[var(--signal)]" aria-describedby={describedBy} />
          {f.label}
        </label>
        {hint && <p id={`${id}-h`} className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        {error && <p id={`${id}-e`} className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-2 text-sm">{f.label}
        {hint && <span id={`${id}-h`} className="rounded-full bg-ember/10 px-1.5 py-px text-[10px] text-ember">{hint}</span>}
      </label>
      {f.type === "dropdown" ? (
        <select id={id} name={`custom.${f.key}`} defaultValue={value == null ? "" : String(value)} aria-invalid={!!error} aria-describedby={describedBy} className={base}>
          <option value="">—</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input id={id} name={`custom.${f.key}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step={f.type === "number" ? "any" : undefined}
          defaultValue={value == null ? "" : String(value)} aria-invalid={!!error} aria-describedby={describedBy} className={base} />
      )}
      {error && <p id={`${id}-e`} className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Pulls `custom.*` entries out of a FormData into an object. Last value wins (checkbox hidden+checked). */
export function readCustom(form: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("custom.")) out[k.slice(7)] = String(v);
  return out;
}

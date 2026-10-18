import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "../db";
import { audit } from "../audit";
import type { Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";

const { customFields, pipelines, stages, stageRequiredFields, opportunities } = schema;
export type FieldDef = typeof customFields.$inferSelect;
export type Entity = FieldDef["entity"];
export type FieldType = FieldDef["type"];

/** Shared fields (pipelineId null) + the pipeline's own set (F2.3). */
export async function fieldsFor(workspaceId: string, entity: Entity, pipelineId?: string | null, tx: Tx | typeof db = db) {
  return tx.select().from(customFields).where(and(
    eq(customFields.workspaceId, workspaceId), eq(customFields.entity, entity),
    entity === "opportunity" && pipelineId ? or(isNull(customFields.pipelineId), eq(customFields.pipelineId, pipelineId)) : isNull(customFields.pipelineId),
  )).orderBy(asc(customFields.position), asc(customFields.createdAt));
}

/** Server-side coercion + validation of custom values; unknown keys are dropped (Q3). */
export function validateCustom(defs: FieldDef[], input: Record<string, unknown>, base: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...base };
  const errors: Record<string, string> = {};
  for (const f of defs) {
    if (!(f.key in input)) continue;
    const v = input[f.key];
    if (v === "" || v === null || v === undefined) { delete out[f.key]; continue; }
    switch (f.type) {
      case "text": out[f.key] = String(v).slice(0, 2000); break;
      case "number": { const n = Number(v); if (Number.isFinite(n)) out[f.key] = n; else errors[f.key] = `${f.label} must be a number`; break; }
      case "date": { const d = new Date(String(v)); if (!isNaN(d.getTime())) out[f.key] = d.toISOString().slice(0, 10); else errors[f.key] = `${f.label} must be a date`; break; }
      case "checkbox": out[f.key] = v === true || v === "true" || v === "on" || v === "1"; break;
      case "dropdown": if (f.options.includes(String(v))) out[f.key] = String(v); else errors[f.key] = `${f.label}: choose one of the options`; break;
    }
  }
  if (Object.keys(errors).length) throw invalid("Some fields are invalid.", errors);
  return out;
}

const isFilled = (v: unknown) => v !== undefined && v !== null && v !== "" && v !== false;

/** F2.4 — which required fields are missing for entering `stageId`. */
export async function missingForStage(stageId: string, custom: Record<string, unknown>, tx: Tx | typeof db = db) {
  const req = await tx.select({ key: customFields.key, label: customFields.label })
    .from(stageRequiredFields).innerJoin(customFields, eq(customFields.id, stageRequiredFields.fieldId))
    .where(eq(stageRequiredFields.stageId, stageId));
  return req.filter((r) => !isFilled(custom[r.key]));
}

/* ------------------------------------------------------------------ configuration (config.manage) */

export async function createField(ctx: Ctx, input: { entity: Entity; label: string; type: FieldType; options?: string[]; pipelineId?: string | null }) {
  ctx.require("config.manage", "manage custom fields");
  const key = input.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
  if (input.type === "dropdown" && !(input.options ?? []).filter(Boolean).length) throw invalid("Add at least one option for a dropdown.", { options: "Required" });
  if (input.pipelineId) await assertPipeline(ctx, input.pipelineId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(customFields).where(and(eq(customFields.workspaceId, ctx.workspaceId), eq(customFields.entity, input.entity)));
  try {
    const [f] = await db.insert(customFields).values({
      workspaceId: ctx.workspaceId, entity: input.entity, key, label: input.label.trim(), type: input.type,
      options: input.type === "dropdown" ? [...new Set((input.options ?? []).map((o) => o.trim()).filter(Boolean))] : [],
      pipelineId: input.entity === "opportunity" ? input.pipelineId ?? null : null, position: n,
    }).returning();
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "field.created", targetType: "custom_field", targetId: f.id, after: f });
    return f;
  } catch (e) {
    if (String(e).includes("fields_ws_entity_key")) throw conflict(`A ${input.entity} field called "${input.label}" already exists.`);
    throw e;
  }
}

export async function updateField(ctx: Ctx, id: string, patch: { label?: string; options?: string[] }) {
  ctx.require("config.manage", "manage custom fields");
  const [f] = await db.select().from(customFields).where(and(eq(customFields.id, id), eq(customFields.workspaceId, ctx.workspaceId)));
  if (!f) throw notFound("Field");
  const [u] = await db.update(customFields).set({
    label: patch.label?.trim() || f.label,
    options: f.type === "dropdown" && patch.options ? [...new Set(patch.options.map((o) => o.trim()).filter(Boolean))] : f.options,
  }).where(eq(customFields.id, id)).returning();
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "field.updated", targetType: "custom_field", targetId: id, before: f, after: u });
  return u;
}

/** Deleting a field also strips its stored values, so no record keeps orphaned data (Q4). */
export async function deleteField(ctx: Ctx, id: string) {
  ctx.require("config.manage", "manage custom fields");
  await db.transaction(async (tx) => {
    const [f] = await tx.select().from(customFields).where(and(eq(customFields.id, id), eq(customFields.workspaceId, ctx.workspaceId)));
    if (!f) throw notFound("Field");
    const table = f.entity === "contact" ? schema.contacts : f.entity === "company" ? schema.companies : schema.opportunities;
    await tx.update(table).set({ custom: sql`${table.custom} - ${f.key}` }).where(eq(table.workspaceId, ctx.workspaceId));
    await tx.delete(customFields).where(eq(customFields.id, id)); // cascades stage requirements
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "field.deleted", targetType: "custom_field", targetId: id, before: f }, tx);
  });
}

async function assertPipeline(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  const [p] = await tx.select().from(pipelines).where(and(eq(pipelines.id, id), eq(pipelines.workspaceId, ctx.workspaceId)));
  if (!p) throw notFound("Pipeline");
  return p;
}

export async function listPipelines(workspaceId: string) {
  // Three reads in parallel, all scoped by workspace (one round trip instead of three).
  const [ps, ss, req] = await Promise.all([
    db.select().from(pipelines).where(eq(pipelines.workspaceId, workspaceId)).orderBy(asc(pipelines.position), asc(pipelines.createdAt)),
    db.select().from(stages).where(eq(stages.workspaceId, workspaceId)).orderBy(asc(stages.position)),
    db.select({ stageId: stageRequiredFields.stageId, fieldId: stageRequiredFields.fieldId }).from(stageRequiredFields)
      .innerJoin(stages, eq(stages.id, stageRequiredFields.stageId)).where(eq(stages.workspaceId, workspaceId)),
  ]);
  return ps.map((p) => ({ ...p, stages: ss.filter((s) => s.pipelineId === p.id).map((s) => ({ ...s, requiredFieldIds: req.filter((r) => r.stageId === s.id).map((r) => r.fieldId) })) }));
}

export async function createPipeline(ctx: Ctx, name: string) {
  ctx.require("config.manage", "manage pipelines");
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(pipelines).where(eq(pipelines.workspaceId, ctx.workspaceId));
    const [p] = await tx.insert(pipelines).values({ workspaceId: ctx.workspaceId, name: name.trim(), position: n }).returning();
    await tx.insert(stages).values([
      { workspaceId: ctx.workspaceId, pipelineId: p.id, name: "New", position: 0, kind: "open" },
      { workspaceId: ctx.workspaceId, pipelineId: p.id, name: "Won", position: 1, kind: "won" },
      { workspaceId: ctx.workspaceId, pipelineId: p.id, name: "Lost", position: 2, kind: "lost" },
    ]);
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "pipeline.created", targetType: "pipeline", targetId: p.id, after: p }, tx);
    return p;
  });
}

export async function renamePipeline(ctx: Ctx, id: string, name: string) {
  ctx.require("config.manage", "manage pipelines");
  const p = await assertPipeline(ctx, id);
  await db.update(pipelines).set({ name: name.trim() }).where(eq(pipelines.id, id));
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "pipeline.renamed", targetType: "pipeline", targetId: id, before: { name: p.name }, after: { name } });
}

export async function addStage(ctx: Ctx, pipelineId: string, name: string, kind: "open" | "won" | "lost" = "open") {
  ctx.require("config.manage", "manage pipelines");
  await assertPipeline(ctx, pipelineId);
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(position), -1)::int + 1` }).from(stages).where(eq(stages.pipelineId, pipelineId));
  const [s] = await db.insert(stages).values({ workspaceId: ctx.workspaceId, pipelineId, name: name.trim(), position: n, kind }).returning();
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "stage.created", targetType: "stage", targetId: s.id, after: s });
  return s;
}

async function ownStage(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  const [s] = await tx.select().from(stages).where(and(eq(stages.id, id), eq(stages.workspaceId, ctx.workspaceId)));
  if (!s) throw notFound("Stage");
  return s;
}

export async function updateStage(ctx: Ctx, id: string, patch: { name?: string; kind?: "open" | "won" | "lost"; requiredFieldIds?: string[] }) {
  ctx.require("config.manage", "manage pipelines");
  await db.transaction(async (tx) => {
    const s = await ownStage(ctx, id, tx);
    await tx.update(stages).set({ name: patch.name?.trim() || s.name, kind: patch.kind ?? s.kind }).where(eq(stages.id, id));
    let before: string[] | undefined;
    if (patch.requiredFieldIds) {
      before = (await tx.select().from(stageRequiredFields).where(eq(stageRequiredFields.stageId, id))).map((r) => r.fieldId);
      const valid = patch.requiredFieldIds.length ? await tx.select({ id: customFields.id }).from(customFields).where(and(
        inArray(customFields.id, patch.requiredFieldIds), eq(customFields.workspaceId, ctx.workspaceId), eq(customFields.entity, "opportunity"),
        or(isNull(customFields.pipelineId), eq(customFields.pipelineId, s.pipelineId)))) : [];
      await tx.delete(stageRequiredFields).where(eq(stageRequiredFields.stageId, id));
      if (valid.length) await tx.insert(stageRequiredFields).values(valid.map((v) => ({ stageId: id, fieldId: v.id })));
    }
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "stage.updated", targetType: "stage", targetId: id,
      before: { name: s.name, kind: s.kind, requiredFieldIds: before }, after: patch }, tx);
  });
}

export async function reorderStages(ctx: Ctx, pipelineId: string, orderedIds: string[]) {
  ctx.require("config.manage", "manage pipelines");
  await db.transaction(async (tx) => {
    await assertPipeline(ctx, pipelineId, tx);
    const own = await tx.select({ id: stages.id, position: stages.position }).from(stages).where(eq(stages.pipelineId, pipelineId));
    if (own.length !== orderedIds.length || !own.every((s) => orderedIds.includes(s.id))) throw invalid("Stage list is out of date — refresh and try again.");
    for (const [i, sid] of orderedIds.entries()) await tx.update(stages).set({ position: i }).where(eq(stages.id, sid));
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "stage.reordered", targetType: "pipeline", targetId: pipelineId,
      before: own.sort((a, b) => a.position - b.position).map((s) => s.id), after: orderedIds }, tx);
  });
}

/** F2.5 — a stage with opportunities can only be deleted by moving them to another stage first. */
export async function deleteStage(ctx: Ctx, id: string, moveToStageId?: string) {
  ctx.require("config.manage", "manage pipelines");
  await db.transaction(async (tx) => {
    const s = await ownStage(ctx, id, tx);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(eq(opportunities.stageId, id));
    const [{ left }] = await tx.select({ left: sql<number>`count(*)::int` }).from(stages).where(eq(stages.pipelineId, s.pipelineId));
    if (left <= 1) throw conflict("A pipeline needs at least one stage.");
    if (n > 0) {
      if (!moveToStageId || moveToStageId === id) throw conflict(`"${s.name}" contains ${n} opportunit${n === 1 ? "y" : "ies"}. Choose a stage to move them to first.`, { count: n });
      const target = await ownStage(ctx, moveToStageId, tx);
      if (target.pipelineId !== s.pipelineId) throw invalid("Opportunities can only move to a stage in the same pipeline.");
      await tx.update(opportunities).set({ stageId: target.id, updatedAt: new Date(), version: sql`${opportunities.version} + 1` }).where(eq(opportunities.stageId, id));
    }
    await tx.delete(stages).where(eq(stages.id, id));
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "stage.deleted", targetType: "stage", targetId: id, before: s, after: { movedTo: moveToStageId ?? null, moved: n } }, tx);
  });
}

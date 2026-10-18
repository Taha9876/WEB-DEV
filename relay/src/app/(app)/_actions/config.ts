"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import * as F from "@/server/domain/fields";

const id = z.string().uuid();
const name = z.string().trim().min(1, "Name is required").max(60);
const done = () => { revalidatePath("/settings/pipelines"); revalidatePath("/pipeline"); };

export async function createFieldAction(input: unknown) {
  return run(async () => {
    const d = z.object({
      entity: z.enum(["contact", "company", "opportunity"]), label: name,
      type: z.enum(["text", "number", "date", "dropdown", "checkbox"]),
      options: z.array(z.string().max(60)).max(50).optional(), pipelineId: id.nullable().optional(),
    }).parse(input);
    await F.createField(await requireCtx(), d); done();
  });
}
export async function updateFieldAction(fieldId: string, input: unknown) {
  return run(async () => {
    const d = z.object({ label: name.optional(), options: z.array(z.string().max(60)).max(50).optional() }).parse(input);
    await F.updateField(await requireCtx(), id.parse(fieldId), d); done();
  });
}
export async function deleteFieldAction(fieldId: string) {
  return run(async () => { await F.deleteField(await requireCtx(), id.parse(fieldId)); done(); });
}
export async function createPipelineAction(n: string) {
  return run(async () => { const p = await F.createPipeline(await requireCtx(), name.parse(n)); done(); return { id: p.id }; });
}
export async function renamePipelineAction(pipelineId: string, n: string) {
  return run(async () => { await F.renamePipeline(await requireCtx(), id.parse(pipelineId), name.parse(n)); done(); });
}
export async function addStageAction(pipelineId: string, n: string, kind: "open" | "won" | "lost" = "open") {
  return run(async () => { await F.addStage(await requireCtx(), id.parse(pipelineId), name.parse(n), z.enum(["open", "won", "lost"]).parse(kind)); done(); });
}
export async function updateStageAction(stageId: string, input: unknown) {
  return run(async () => {
    const d = z.object({ name: name.optional(), kind: z.enum(["open", "won", "lost"]).optional(), requiredFieldIds: z.array(id).max(50).optional() }).parse(input);
    await F.updateStage(await requireCtx(), id.parse(stageId), d); done();
  });
}
export async function reorderStagesAction(pipelineId: string, ids: string[]) {
  return run(async () => { await F.reorderStages(await requireCtx(), id.parse(pipelineId), z.array(id).max(50).parse(ids)); done(); });
}
export async function deleteStageAction(stageId: string, moveTo?: string) {
  return run(async () => { await F.deleteStage(await requireCtx(), id.parse(stageId), moveTo ? id.parse(moveTo) : undefined); done(); });
}

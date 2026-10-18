import { asc, eq, sql } from "drizzle-orm";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { listPipelines } from "@/server/domain/fields";
import { ConfigView } from "@/components/settings/config-view";

export const metadata = { title: "Pipelines & fields" };

export default async function PipelinesConfigPage() {
  const ctx = await requireCtx();
  ctx.require("config.manage", "manage pipelines and fields");
  const [pipes, fields, counts] = await Promise.all([
    listPipelines(ctx.workspaceId),
    db.select().from(schema.customFields).where(eq(schema.customFields.workspaceId, ctx.workspaceId)).orderBy(asc(schema.customFields.position)),
    db.select({ stageId: schema.opportunities.stageId, n: sql<number>`count(*)::int` }).from(schema.opportunities).where(eq(schema.opportunities.workspaceId, ctx.workspaceId)).groupBy(schema.opportunities.stageId),
  ]);
  return (
    <ConfigView
      pipelines={pipes.map((p) => ({ id: p.id, name: p.name, stages: p.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, requiredFieldIds: s.requiredFieldIds, count: counts.find((c) => c.stageId === s.id)?.n ?? 0 })) }))}
      fields={fields.map((f) => ({ id: f.id, key: f.key, label: f.label, type: f.type, options: f.options, entity: f.entity, pipelineId: f.pipelineId }))}
    />
  );
}

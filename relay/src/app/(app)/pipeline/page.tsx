import { asc, eq, and, sql } from "drizzle-orm";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { listPipelines, fieldsFor } from "@/server/domain/fields";
import { listBoard } from "@/server/domain/crm";
import { Board } from "@/components/crm/board";
import { PageHeader, EmptyState } from "@/components/app/static";
import { Columns3 } from "lucide-react";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ p?: string; q?: string; owner?: string }> }) {
  const ctx = await requireCtx();
  ctx.require("crm.view", "view the pipeline");
  const sp = await searchParams;
  const pipes = await listPipelines(ctx.workspaceId);
  const pipe = pipes.find((p) => p.id === sp.p) ?? pipes[0];
  if (!pipe) return (<><PageHeader title="Pipeline" /><EmptyState icon={Columns3} title="No pipelines yet" body="An Admin can create one under Pipelines & fields." /></>);

  const filters = [{ field: "q", value: sp.q ?? "" }, { field: "owner", value: sp.owner ?? "" }];
  const contactCond = ctx.can("crm.view_all") ? eq(schema.contacts.workspaceId, ctx.workspaceId) : and(eq(schema.contacts.workspaceId, ctx.workspaceId), eq(schema.contacts.ownerId, ctx.userId));
  const [cards, fields, contacts, team] = await Promise.all([
    listBoard(ctx, pipe.id, filters),
    fieldsFor(ctx.workspaceId, "opportunity", pipe.id),
    db.select({ id: schema.contacts.id, name: sql<string>`trim(${schema.contacts.firstName} || ' ' || coalesce(${schema.contacts.lastName}, ''))` })
      .from(schema.contacts).where(contactCond).orderBy(asc(schema.contacts.firstName)).limit(300),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.workspaceId, ctx.workspaceId)).orderBy(asc(schema.users.name)),
  ]);

  return (
    <Board
      pipelines={pipes.map((p) => ({ id: p.id, name: p.name }))}
      pipeline={{ id: pipe.id, name: pipe.name, stages: pipe.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, requiredFieldIds: s.requiredFieldIds })) }}
      cards={cards.map((c) => ({ ...c, updatedAt: c.updatedAt.getTime() }))}
      fields={fields} contacts={contacts} team={team}
      can={{ create: ctx.can("crm.create"), edit: ctx.can("crm.edit"), del: ctx.can("crm.delete"), value: ctx.can("crm.view_value"), export: ctx.can("crm.export"), viewAll: ctx.can("crm.view_all") }}
      q={sp.q ?? ""} owner={sp.owner ?? ""}
    />
  );
}

import { and, asc, eq } from "drizzle-orm";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { listContacts, mySavedLists, type Filter } from "@/server/domain/crm";
import { fieldsFor, listPipelines } from "@/server/domain/fields";
import { ContactsView } from "@/components/crm/contacts-view";

export const metadata = { title: "Contacts" };
const KEYS = ["q", "owner", "tag", "stage", "source", "created_after", "created_before"];

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  ctx.require("crm.view", "view contacts");
  const sp = await searchParams;
  const lists = await mySavedLists(ctx, "contacts");
  const active = lists.find((l) => l.id === sp.list);
  const filters: Filter[] = active
    ? (active.filters as Filter[])
    : Object.entries(sp).filter(([k, v]) => v && (KEYS.includes(k) || k.startsWith("custom:"))).map(([field, value]) => ({ field, value: value! }));
  const page = Math.max(1, Number(sp.p) || 1);

  const [{ rows, total }, fields, pipes, team, companies, tags] = await Promise.all([
    listContacts(ctx, filters, page),
    fieldsFor(ctx.workspaceId, "contact"),
    listPipelines(ctx.workspaceId),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.workspaceId, ctx.workspaceId)).orderBy(asc(schema.users.name)),
    db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.workspaceId, ctx.workspaceId)).orderBy(asc(schema.companies.name)),
    db.selectDistinct({ tag: schema.contacts.tags }).from(schema.contacts).where(and(eq(schema.contacts.workspaceId, ctx.workspaceId))).limit(500),
  ]);

  return (
    <ContactsView
      rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }))} total={total} page={page}
      filters={filters} lists={lists.map((l) => ({ id: l.id, name: l.name }))} activeList={active?.id ?? null}
      fields={fields} team={team} companies={companies}
      stages={pipes.flatMap((p) => p.stages.map((s) => ({ id: s.id, name: pipes.length > 1 ? `${p.name} · ${s.name}` : s.name })))}
      tags={[...new Set(tags.flatMap((t) => t.tag))].sort()}
      can={{ create: ctx.can("crm.create"), export: ctx.can("crm.export"), viewAll: ctx.can("crm.view_all") }}
    />
  );
}

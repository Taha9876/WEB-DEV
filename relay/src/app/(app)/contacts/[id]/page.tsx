import { asc, eq } from "drizzle-orm";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { getContactView } from "@/server/domain/crm";
import { listPipelines } from "@/server/domain/fields";
import { ContactDetail } from "@/components/crm/contact-detail";

export const metadata = { title: "Contact" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pay?: string; book?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const sp = await searchParams;
  const [v, pipes, companies, team] = await Promise.all([
    getContactView(ctx, id),
    listPipelines(ctx.workspaceId),
    db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.workspaceId, ctx.workspaceId)).orderBy(asc(schema.companies.name)),
    db.select({ id: schema.users.id, name: schema.users.name, timezone: schema.users.timezone, calendar: schema.calendarConnections.status }).from(schema.users).leftJoin(schema.calendarConnections, eq(schema.calendarConnections.userId, schema.users.id)).where(eq(schema.users.workspaceId, ctx.workspaceId)).orderBy(asc(schema.users.name)),
  ]);
  const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as T; // Dates → ISO strings for the client
  return (
    <ContactDetail
      v={ser(v) as never} pipelines={pipes.map((p) => ({ id: p.id, name: p.name }))} companies={companies} team={team}
      me={{ id: ctx.userId, timezone: ctx.user.timezone }}
      can={{ edit: ctx.can("crm.edit"), del: ctx.can("crm.delete"), create: ctx.can("crm.create"), value: ctx.can("crm.view_value") }}
      intent={{ pay: sp.pay, book: sp.book }}
    />
  );
}

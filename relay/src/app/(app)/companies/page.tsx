import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Building2 } from "lucide-react";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/app/static";
import { NewCompany } from "@/components/crm/new-company";

export const metadata = { title: "Companies" };

/** F2.1 — companies with their contacts; each contact links to its full record. */
export default async function CompaniesPage() {
  const ctx = await requireCtx();
  ctx.require("crm.view", "view companies");
  const [companies, contacts] = await Promise.all([
    db.select({ id: schema.companies.id, name: schema.companies.name, domain: schema.companies.domain,
      opps: sql<number>`(select count(*)::int from opportunities o where o.company_id = ${schema.companies.id})` })
      .from(schema.companies).where(eq(schema.companies.workspaceId, ctx.workspaceId)).orderBy(asc(schema.companies.name)),
    db.select({ id: schema.contacts.id, companyId: schema.contacts.companyId, name: sql<string>`trim(${schema.contacts.firstName} || ' ' || coalesce(${schema.contacts.lastName}, ''))` })
      .from(schema.contacts).where(sql`${schema.contacts.workspaceId} = ${ctx.workspaceId} and ${schema.contacts.companyId} is not null
        ${ctx.can("crm.view_all") ? sql`` : sql`and ${schema.contacts.ownerId} = ${ctx.userId}`}`),
  ]);
  return (
    <div>
      <PageHeader title="Companies" description="Organisations your contacts belong to. Assign a contact to a company from its Details panel.">
        {ctx.can("crm.create") && <NewCompany />}
      </PageHeader>
      {!companies.length ? <EmptyState icon={Building2} title="No companies yet" body="Create one, then link contacts to it." /> : (
        <ul className="grid gap-4 px-4 py-6 sm:grid-cols-2 sm:px-8 xl:grid-cols-3">
          {companies.map((c) => {
            const people = contacts.filter((x) => x.companyId === c.id);
            return (
              <li key={c.id} className="edge rounded-3xl p-5">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-hairline bg-background"><Building2 className="size-5 text-muted-foreground" /></span>
                  <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.domain ?? "—"} · {c.opps} opportunit{c.opps === 1 ? "y" : "ies"}</p></div></div>
                <ul className="mt-4 space-y-1">{people.map((p) => <li key={p.id}><Link href={`/contacts/${p.id}`} className="block rounded-lg px-2 py-1 text-sm hover:bg-accent">{p.name}</Link></li>)}
                  {!people.length && <li className="px-2 text-sm text-muted-foreground">No contacts linked.</li>}</ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

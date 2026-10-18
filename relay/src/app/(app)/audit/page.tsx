import Link from "next/link";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { PageHeader, EmptyState, Avatar } from "@/components/app/static";
import { AuditFilters } from "@/components/settings/audit-filters";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };
const PAGE = 50;

/** F4.2 — permission-gated, filterable, read-only. There is no edit or delete anywhere, and the DB trigger forbids it (F4.3). */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; from?: string; to?: string; p?: string }> }) {
  const ctx = await requireCtx();
  ctx.require("audit.view", "view the audit log");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const a = schema.auditLogs;
  const conds: (SQL | undefined)[] = [eq(a.workspaceId, ctx.workspaceId)];
  if (sp.action) conds.push(sql`${a.action} like ${sp.action.replace(/[%_]/g, "") + "%"}`);
  if (sp.actor === "system") conds.push(sql`${a.actorId} is null`);
  else if (sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor)) conds.push(eq(a.actorId, sp.actor));
  if (sp.from && !isNaN(Date.parse(sp.from))) conds.push(gte(a.createdAt, new Date(sp.from)));
  if (sp.to && !isNaN(Date.parse(sp.to))) conds.push(lte(a.createdAt, new Date(new Date(sp.to).getTime() + 86_400_000)));

  const [rows, actions, team] = await Promise.all([
    db.select({ e: a, actor: schema.users.name }).from(a).leftJoin(schema.users, eq(schema.users.id, a.actorId)).where(and(...conds))
      .orderBy(desc(a.createdAt), desc(a.id)).limit(PAGE + 1).offset((page - 1) * PAGE),
    db.selectDistinct({ action: a.action }).from(a).where(eq(a.workspaceId, ctx.workspaceId)).orderBy(asc(a.action)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.workspaceId, ctx.workspaceId)).orderBy(asc(schema.users.name)),
  ]);
  const more = rows.length > PAGE;
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "p")), p: String(p) } as Record<string, string>)}`;
  const show = (v: unknown) => v == null ? "" : JSON.stringify(v, null, 1).replace(/[{}"]/g, "").replace(/\n\s*/g, " ").trim().slice(0, 300);

  return (
    <div className="pb-16">
      <PageHeader title={<>Audit <em className="italic">log</em></>} description="Append-only history of assignments, escalations, permission and configuration changes, integrations and deletions. Entries can't be edited or deleted — not even by the Owner." />
      <AuditFilters actions={[...new Set(actions.map((x) => x.action.split(".")[0]))].concat(actions.map((x) => x.action))} team={team} value={sp} />
      {!rows.length ? <EmptyState icon={ScrollText} title="No matching events" body="Try widening the filters." /> : (
        <ol className="divide-y divide-hairline">
          {rows.slice(0, PAGE).map(({ e, actor }) => (
            <li key={e.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[11rem_12rem_1fr] sm:px-8">
              <time dateTime={e.createdAt.toISOString()} className="font-mono text-xs text-muted-foreground tabular">{dateTime(e.createdAt, ctx.user.timezone)}</time>
              <span className="flex items-center gap-2 text-sm">{actor ? <><Avatar name={actor} className="size-5 text-[8px]" />{actor}</> : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">System</span>}</span>
              <div className="min-w-0 text-sm">
                <p><code className="rounded bg-surface px-1.5 py-0.5 text-xs">{e.action}</code> <span className="text-muted-foreground">on {e.targetType}</span>
                  {e.targetType === "lead" && e.targetId && <Link href={`/leads/${e.targetId}`} className="ml-1 text-xs underline underline-offset-2">open</Link>}</p>
                {(e.before != null || e.after != null) && (
                  <div className="mt-1.5 grid gap-1 text-xs sm:grid-cols-2">
                    {e.before != null && <p className="truncate rounded-lg bg-destructive/[0.06] px-2 py-1 font-mono text-muted-foreground" title={JSON.stringify(e.before)}><span className="text-destructive">−</span> {show(e.before)}</p>}
                    {e.after != null && <p className="truncate rounded-lg bg-ok/[0.06] px-2 py-1 font-mono text-muted-foreground" title={JSON.stringify(e.after)}><span className="text-ok">+</span> {show(e.after)}</p>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex justify-between px-4 py-4 text-sm sm:px-8">
        {page > 1 ? <Link href={qs(page - 1)} className="text-muted-foreground hover:text-foreground">← Newer</Link> : <span />}
        {more && <Link href={qs(page + 1)} className="text-muted-foreground hover:text-foreground">Older →</Link>}
      </div>
    </div>
  );
}

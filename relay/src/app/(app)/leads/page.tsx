import { requireCtx } from "@/server/context";
import { listLeads, seesAll, teamForAssignment, type LeadFilter } from "@/server/domain/leads-read";
import { LeadsView } from "@/components/leads/leads-view";

export const metadata = { title: "Leads" };
const FILTERS: LeadFilter[] = ["open", "mine", "unassigned", "acknowledged", "closed", "all", "today", "escalated"];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ f?: string; p?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const filter = FILTERS.includes(sp.f as LeadFilter) ? (sp.f as LeadFilter) : "open";
  const page = Math.max(1, Number(sp.p) || 1);
  const [{ rows, total }, team] = await Promise.all([listLeads(ctx, filter, page), ctx.can("leads.manage") ? teamForAssignment(ctx) : []]);
  return (
    <LeadsView
      rows={rows.map((r) => ({ ...r, ackDeadline: r.ackDeadline?.getTime() ?? null, assignedAt: r.assignedAt?.getTime() ?? null, createdAt: r.createdAt.getTime(), exhaustedAt: r.exhaustedAt?.getTime() ?? null }))}
      total={total} page={page} filter={filter} team={team} me={ctx.userId}
      canManage={ctx.can("leads.manage")} canCreate={ctx.can("crm.create")} teamView={seesAll(ctx)} serverNow={Date.now()}
    />
  );
}

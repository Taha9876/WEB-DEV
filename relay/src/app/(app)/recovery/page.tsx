import Link from "next/link";
import { AlarmClock, ArrowUpRight } from "lucide-react";
import { requireCtx } from "@/server/context";
import { recoveryQueue } from "@/server/domain/leads";
import { seesAll } from "@/server/domain/leads-read";
import { PageHeader, EmptyState, SourceBadge, Avatar } from "@/components/app/primitives";
import { relative } from "@/lib/format";

export const metadata = { title: "Recovery queue" };

/** F3.7 — every lead at risk, each with the reason it is here. */
export default async function RecoveryPage() {
  const ctx = await requireCtx();
  const rows = await recoveryQueue(ctx.workspaceId, seesAll(ctx) ? undefined : ctx.userId);
  return (
    <div>
      <PageHeader title={<>Recovery <em className="italic">queue</em></>} description="Leads unacknowledged beyond their window, escalated two or more times, waiting for an owner, or untouched for the idle period." />
      {!rows.length ? <EmptyState icon={AlarmClock} title="Nothing at risk" body="Every open lead has an owner who is on time. This page fills itself the moment something slips." /> : (
        <ul className="divide-y divide-hairline">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-8">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/leads/${r.id}`} className="font-medium hover:underline hover:underline-offset-4">{r.contact_name}</Link>
                  <SourceBadge source={r.source as "web_form"} />
                  <span className="text-xs text-muted-foreground">created {relative(r.created_at)}</span>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Reasons">
                  {r.reasons.map((x) => <li key={x} className="rounded-full bg-ember/10 px-2 py-0.5 text-[11px] text-ember">{x}</li>)}
                </ul>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {r.owner_name ? <><Avatar name={r.owner_name} />{r.owner_name}</> : <span className="text-ember">No owner</span>}
                <Link href={`/leads/${r.id}`} aria-label="Open lead" className="grid size-8 place-items-center rounded-lg hover:bg-accent"><ArrowUpRight className="size-4" /></Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

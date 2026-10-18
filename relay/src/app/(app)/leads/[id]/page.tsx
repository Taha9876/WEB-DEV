import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCtx } from "@/server/context";
import { getLead, teamForAssignment } from "@/server/domain/leads-read";
import { getSettings } from "@/server/domain/leads";
import { LeadDetail } from "@/components/leads/lead-detail";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const [l, team, settings] = await Promise.all([getLead(ctx, id), ctx.can("leads.manage") ? teamForAssignment(ctx) : [], getSettings(ctx.workspaceId)]);
  const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x));
  return (
    <div>
      <div className="px-4 pt-6 sm:px-8"><Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Leads</Link></div>
      <LeadDetail l={ser(l)} team={team} me={ctx.userId} canManage={ctx.can("leads.manage")} serverNow={Date.now()}
        chain={ser(settings.escalationChain)} ackWindow={settings.ackWindowSeconds} absencePolicy={settings.acknowledgedOnAbsence} />
    </div>
  );
}

import { requireCtx } from "@/server/context";
import { dashboard } from "@/server/domain/metrics";
import { aiEnabled } from "@/server/ai";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireCtx();
  const d = await dashboard(ctx);
  return (
    <DashboardView d={JSON.parse(JSON.stringify(d))} name={ctx.user.name.split(" ")[0]} prefs={ctx.user.dashboardPrefs}
      canBrief={ctx.can("leads.manage") && aiEnabled()} currency="USD" />
  );
}

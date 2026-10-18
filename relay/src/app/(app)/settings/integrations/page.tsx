import { requireCtx } from "@/server/context";
import { overview, syncHistory } from "@/server/domain/integrations-admin";
import { IntegrationsView } from "@/components/settings/integrations-view";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ provider?: string; result?: string; p?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const manage = ctx.can("integrations.manage");
  const [cards, history] = await Promise.all([overview(ctx), manage ? syncHistory(ctx, { provider: sp.provider, result: sp.result, page: Number(sp.p) || 1 }) : []]);
  const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x));
  return <IntegrationsView cards={ser(cards)} history={ser(history)} canManage={manage} filter={{ provider: sp.provider ?? "", result: sp.result ?? "" }} />;
}

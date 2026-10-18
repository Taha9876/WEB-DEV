import { requireCtx } from "@/server/context";
import { PageHeader } from "@/components/app/primitives";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireCtx();
  return <PageHeader title={<>Good to see you, <em className="italic">{ctx.user.name.split(" ")[0]}</em></>} description="Live overview" />;
}

import { asc, eq } from "drizzle-orm";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/domain/leads";
import { aiEnabled } from "@/server/ai";
import { env } from "@/server/env";
import { RulesView } from "@/components/settings/rules-view";

export const metadata = { title: "Assignment rules" };

export default async function RulesPage() {
  const ctx = await requireCtx();
  ctx.require("leads.rules", "manage assignment rules");
  const [s, team] = await Promise.all([getSettings(ctx.workspaceId),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.workspaceId, ctx.workspaceId)).orderBy(asc(schema.users.name))]);
  return (
    <RulesView team={team} ai={aiEnabled()} formUrl={`${env.APP_URL}/f/${s.webFormKey}`}
      s={{ maxOpenLeads: s.maxOpenLeads, ackWindowSeconds: s.ackWindowSeconds, idleSeconds: s.idleSeconds, acknowledgedOnAbsence: s.acknowledgedOnAbsence as "keep" | "reassign",
        aiFirstResponse: s.aiFirstResponse, escalationChain: s.escalationChain }} />
  );
}

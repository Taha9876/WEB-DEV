"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { db, schema } from "@/server/db";
import { AppError } from "@/server/errors";
import { AiUnavailable } from "@/server/ai";
import { dashboard } from "@/server/domain/metrics";
import { managerBriefing } from "@/server/domain/ai-features";

/** F5.5 — per-user show/hide, remembered server-side. */
export async function saveDashboardPrefsAction(prefs: Record<string, boolean>) {
  return run(async () => {
    const ctx = await requireCtx();
    await db.update(schema.users).set({ dashboardPrefs: z.record(z.string().max(40), z.boolean()).parse(prefs) }).where(eq(schema.users.id, ctx.userId));
  });
}

/** AI briefing built only from live dashboard numbers. */
export async function briefingAction() {
  return run(async () => {
    const ctx = await requireCtx();
    const d = await dashboard(ctx);
    const facts = [
      `New leads today: ${d.newLeadsToday}`, `Average time to first response (30 days): ${d.avgFirstResponseSec ? Math.round(d.avgFirstResponseSec) + "s" : "n/a"} over ${d.responsesMeasured} leads`,
      `Recovery queue: ${d.recoveryCount}`, `Leads escalated in last 24h: ${d.escalations24h}`,
      `Team: ${d.availability.map((a) => `${a.name} (${a.status}, ${a.open} open leads)`).join("; ")}`,
      d.pipelineByStage ? `Open pipeline by stage: ${d.pipelineByStage.map((s) => `${s.stage} ${s.n} deals`).join(", ")}` : "",
      `Upcoming appointments (7 days): ${d.upcoming.length}`,
    ].filter(Boolean).join("\n");
    try { return await managerBriefing(ctx, facts); } catch (e) { if (e instanceof AiUnavailable) throw new AppError(503, "ai_unavailable", e.message); throw e; }
  });
}

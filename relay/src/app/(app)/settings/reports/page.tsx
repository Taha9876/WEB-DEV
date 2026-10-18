import { requireCtx } from "@/server/context";
import { getSchedule, reportHistory } from "@/server/domain/reports";
import { emailMode } from "@/server/integrations/email";
import { ReportsView } from "@/components/settings/reports-view";

export const metadata = { title: "Email reports" };

export default async function ReportsPage() {
  const ctx = await requireCtx();
  const [s, history] = await Promise.all([getSchedule(ctx), reportHistory(ctx)]);
  return (
    <ReportsView
      me={{ email: ctx.user.email, timezone: ctx.user.timezone }} mode={emailMode()} canSchedule={ctx.can("leads.manage")}
      schedule={s ? { recipients: s.recipients.join(", "), hour: s.hour, timezone: s.timezone, enabled: s.enabled, lastSentAt: s.lastSentAt?.toISOString() ?? null } : null}
      history={history.map((h) => ({ at: h.at.toISOString(), result: h.result, error: h.error, to: ((h.detail as { to?: string[] }).to ?? []).join(", "), previewUrl: (h.detail as { previewUrl?: string }).previewUrl ?? null }))}
    />
  );
}

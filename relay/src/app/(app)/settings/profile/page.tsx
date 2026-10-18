import { and, eq } from "drizzle-orm";
import { requireCtx } from "@/server/context";
import { db, schema } from "@/server/db";
import { linkToken } from "@/server/integrations/telegram";
import { googleConfigured } from "@/server/integrations/google";
import { ProfileView } from "@/components/settings/profile-view";

export const metadata = { title: "Profile & alerts" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ calendar?: string; reason?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [[tg], [cal]] = await Promise.all([
    db.select().from(schema.integrations).where(and(eq(schema.integrations.workspaceId, ctx.workspaceId), eq(schema.integrations.provider, "telegram"))),
    db.select({ status: schema.calendarConnections.status, email: schema.calendarConnections.googleEmail, lastError: schema.calendarConnections.lastError })
      .from(schema.calendarConnections).where(eq(schema.calendarConnections.userId, ctx.userId)),
  ]);
  const bot = tg?.status === "connected" ? tg.publicConfig.botUsername : null;
  return (
    <ProfileView
      name={ctx.user.name} email={ctx.user.email} timezone={ctx.user.timezone}
      telegram={{ connected: !!ctx.user.telegramChatId, chatId: ctx.user.telegramChatId ?? "", bot, deepLink: bot ? `https://t.me/${bot}?start=${linkToken(ctx.userId)}` : null }}
      calendar={{ configured: googleConfigured(), status: cal?.status ?? null, email: cal?.email ?? null, lastError: cal?.lastError ?? null }}
      flash={sp.calendar ? { kind: sp.calendar, reason: sp.reason } : null}
    />
  );
}

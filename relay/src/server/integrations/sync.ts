import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { decryptJson } from "../crypto";
import { tg, telegramWebhookUrl, type TelegramSecrets } from "./telegram";
import { stripeClient, stripeWebhookUrl, type StripeSecrets } from "../domain/payments";
import { logEvent } from "./store";

/**
 * On startup, point provider webhooks at the current public URL (quick tunnels change URL on every run).
 * Failures are logged per provider and never block startup (I5.8).
 */
export async function syncWebhooks() {
  if (!env.APP_URL.startsWith("https://")) return;
  const rows = await db.select().from(schema.integrations)
    .where(and(eq(schema.integrations.status, "connected"), inArray(schema.integrations.provider, ["telegram", "stripe"])));
  for (const r of rows) {
    if (!r.secretsEnc) continue;
    try {
      if (r.provider === "telegram") {
        const s = decryptJson<TelegramSecrets>(r.secretsEnc);
        await tg(s.botToken, "setWebhook", { url: telegramWebhookUrl(r.workspaceId), secret_token: s.webhookSecret, allowed_updates: ["message"] });
        await db.update(schema.integrations).set({ publicConfig: { ...r.publicConfig, webhook: "active" } }).where(eq(schema.integrations.id, r.id));
      } else {
        const s = decryptJson<StripeSecrets>(r.secretsEnc);
        if (s.endpointId) await stripeClient(s.secretKey).webhookEndpoints.update(s.endpointId, { url: stripeWebhookUrl(r.workspaceId) });
      }
      await logEvent({ workspaceId: r.workspaceId, provider: r.provider, direction: "outbound", kind: "webhook.sync", reference: env.APP_URL, result: "success" });
    } catch (e) {
      await logEvent({ workspaceId: r.workspaceId, provider: r.provider, direction: "outbound", kind: "webhook.sync", result: "failure", error: String(e) });
    }
  }
}

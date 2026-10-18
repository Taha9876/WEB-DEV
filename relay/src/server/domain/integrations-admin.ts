import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import type { Ctx } from "../context";
import { AppError, conflict, invalid } from "../errors";
import { mask, randomToken } from "../crypto";
import { disconnect, saveConnection, logEvent, type Provider } from "../integrations/store";
import { testTwilio, twilioWebhookUrl } from "../integrations/twilio";
import { testStripe, stripeWebhookUrl } from "./payments";
import { setupTelegram } from "../integrations/telegram";
import { googleConfigured } from "../integrations/google";
import { env } from "../env";

/** I5.6 — what each integration can and cannot do, shown verbatim in the UI. */
export const LIMITS: Record<Provider, { can: string[]; cannot: string[] }> = {
  twilio: {
    can: ["Receive WhatsApp messages and create contacts + leads from unknown numbers", "Send replies and track sent / delivered / read / failed", "Honour STOP opt-outs"],
    cannot: ["Reach phones that haven't joined the sandbox (send the join phrase first)", "Start a conversation more than 24h after the customer's last message (sandbox/WhatsApp rule)", "Send media attachments (text only in this version)"],
  },
  stripe: {
    can: ["Create hosted Checkout links from an opportunity", "Mark payments paid, failed, expired or refunded from verified webhooks"],
    cannot: ["Accept live payments — test mode keys only", "Store or see card numbers (entered only on Stripe's page)", "Issue refunds from Relay (do it in the Stripe dashboard; Relay reflects it)"],
  },
  google: {
    can: ["Each employee connects their own Google Calendar", "Check free/busy and book, reschedule or cancel events"],
    cannot: ["Book someone who hasn't connected their calendar", "Keep working after a user revokes access (they must reconnect)", "Unverified test apps accept only listed test users; refresh tokens may expire after 7 days"],
  },
  email: {
    can: ["Send the daily progress report now or on a daily schedule", "Use any SMTP provider (Gmail app password, Brevo…) via SMTP_* settings"],
    cannot: ["Deliver to real inboxes without SMTP settings — it then uses a free Ethereal test inbox with a preview link"],
  },
  telegram: {
    can: ["Alert the new owner when a lead escalates, with the lead, source, reason and a link", "Per-employee destination via the bot deep-link or a chat ID"],
    cannot: ["Message someone who hasn't started a chat with the bot", "Receive the deep-link on a non-HTTPS local URL (use manual chat ID locally)"],
  },
};

export async function overview(ctx: Ctx) {
  const rows = await db.select().from(schema.integrations).where(eq(schema.integrations.workspaceId, ctx.workspaceId));
  const recentErrors = await db.select().from(schema.integrationEvents)
    .where(and(eq(schema.integrationEvents.workspaceId, ctx.workspaceId), sql`${schema.integrationEvents.result} in ('failure','rejected')`))
    .orderBy(desc(schema.integrationEvents.createdAt)).limit(40);
  const team = await db.select({ id: schema.users.id, name: schema.users.name, telegram: schema.users.telegramChatId, calendar: schema.calendarConnections.status, googleEmail: schema.calendarConnections.googleEmail })
    .from(schema.users).leftJoin(schema.calendarConnections, eq(schema.calendarConnections.userId, schema.users.id))
    .where(eq(schema.users.workspaceId, ctx.workspaceId)).orderBy(schema.users.name);
  const providers: Provider[] = ["twilio", "stripe", "google", "telegram"];
  return providers.map((p) => {
    const r = rows.find((x) => x.provider === p);
    const status = p === "google"
      ? (googleConfigured() ? (team.some((t) => t.calendar === "connected") ? "connected" : "not_connected") : "not_connected")
      : r?.status ?? "not_connected";
    const lastSuccess = p === "google" ? null : r?.lastSuccessAt ?? null;
    return {
      provider: p, status, publicConfig: r?.publicConfig ?? {}, lastSuccessAt: lastSuccess, lastError: r?.lastError ?? null, lastErrorAt: r?.lastErrorAt ?? null,
      errors: recentErrors.filter((e) => e.provider === p).slice(0, 5).map((e) => ({ at: e.createdAt, kind: e.kind, error: e.error, reference: e.reference })),
      limits: LIMITS[p],
      webhooks: p === "twilio" ? { "When a message comes in": twilioWebhookUrl(ctx.workspaceId, "inbound"), "Status callback (set automatically)": twilioWebhookUrl(ctx.workspaceId, "status") }
        : p === "stripe" ? { "Endpoint URL": stripeWebhookUrl(ctx.workspaceId), Events: "checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, payment_intent.payment_failed, charge.refunded" }
        : p === "google" ? { "Authorised redirect URI": `${env.APP_URL}/api/integrations/google/callback` } : {},
      team: p === "google" ? team.map((t) => ({ name: t.name, status: t.calendar ?? "not_connected", detail: t.googleEmail ?? "" }))
        : p === "telegram" ? team.map((t) => ({ name: t.name, status: t.telegram ? "connected" : "not_connected", detail: t.telegram ? "chat linked" : "" })) : [],
    };
  });
}

const fields: Record<Exclude<Provider, "google" | "email">, string[]> = {
  twilio: ["accountSid", "authToken", "from"], stripe: ["secretKey", "webhookSecret"], telegram: ["botToken"],
};

/** I5.2 / I5.3 / I5.7 — validates credentials against the provider before saving; secrets are encrypted, audit stores only masked tails. */
export async function connect(ctx: Ctx, provider: Exclude<Provider, "google" | "email">, input: Record<string, string>) {
  ctx.require("integrations.manage", "manage integrations");
  const v = Object.fromEntries(fields[provider].map((k) => [k, String(input[k] ?? "").trim()]));
  const missing = fields[provider].filter((k) => !v[k]);
  if (missing.length) throw invalid("Fill in every field.", Object.fromEntries(missing.map((m) => [m, "Required"])));
  try {
    if (provider === "twilio") {
      if (!/^AC[0-9a-f]{32}$/i.test(v.accountSid)) throw invalid("That doesn't look like a Twilio Account SID (AC…).", { accountSid: "Starts with AC" });
      const from = v.from.replace(/^whatsapp:/, "");
      if (!/^\+\d{8,15}$/.test(from)) throw invalid("Use the sandbox number in international format, e.g. +14155238886.", { from: "e.g. +14155238886" });
      const name = await testTwilio(v as never);
      await saveConnection(ctx.workspaceId, "twilio", { ...v, from: `whatsapp:${from}` }, { account: name, accountSid: mask(v.accountSid), from }, ctx.userId);
    } else if (provider === "stripe") {
      const mode = await testStripe(v as never);
      await saveConnection(ctx.workspaceId, "stripe", v, { mode, key: mask(v.secretKey) }, ctx.userId);
    } else {
      const webhookSecret = randomToken(24).replace(/[^A-Za-z0-9_-]/g, "");
      const r = await setupTelegram(ctx.workspaceId, v.botToken, webhookSecret);
      await saveConnection(ctx.workspaceId, "telegram", { botToken: v.botToken, webhookSecret }, { bot: `@${r.botUsername}`, botUsername: r.botUsername, webhook: r.webhook }, ctx.userId);
    }
    await logEvent({ workspaceId: ctx.workspaceId, provider, direction: "outbound", kind: "connection.test", result: "success" });
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent({ workspaceId: ctx.workspaceId, provider, direction: "outbound", kind: "connection.test", result: "failure", error: msg });
    throw conflict(`Couldn't connect: ${msg}`);
  }
}

export async function disconnectProvider(ctx: Ctx, provider: Provider) {
  ctx.require("integrations.manage", "manage integrations");
  await disconnect(ctx.workspaceId, provider, ctx.userId);
}

/** I5.4 — synchronisation history, filterable; authorised users only. */
export async function syncHistory(ctx: Ctx, f: { provider?: string; result?: string; page?: number }) {
  ctx.require("integrations.manage", "view integration history");
  const conds: (SQL | undefined)[] = [eq(schema.integrationEvents.workspaceId, ctx.workspaceId)];
  if (f.provider && ["twilio", "stripe", "google", "telegram"].includes(f.provider)) conds.push(eq(schema.integrationEvents.provider, f.provider as Provider));
  if (f.result && ["success", "failure", "rejected", "duplicate", "retrying"].includes(f.result)) conds.push(eq(schema.integrationEvents.result, f.result));
  const page = Math.max(1, f.page ?? 1);
  return db.select().from(schema.integrationEvents).where(and(...conds)).orderBy(desc(schema.integrationEvents.createdAt)).limit(50).offset((page - 1) * 50);
}

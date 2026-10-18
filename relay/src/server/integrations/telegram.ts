import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { safeEqual } from "../crypto";
import { registerJob, PermanentError } from "../worker/jobs";
import { explain, getSecrets, logEvent, markError, markOk } from "./store";

export type TelegramSecrets = { botToken: string; webhookSecret: string };
const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API(token, method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw Object.assign(new Error(`Telegram unreachable: ${(e as Error).message}`), { status: 0 });
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!json.ok) throw Object.assign(new Error(json.description ?? `HTTP ${res.status}`), { status: json.error_code ?? res.status });
  return json.result as T;
}

export const telegramWebhookUrl = (workspaceId: string) => `${env.APP_URL}/api/webhooks/telegram/${workspaceId}`;

/** Signed deep-link payload: proves which employee opened the bot, without storing extra state. */
export const linkToken = (userId: string) => `${userId.replace(/-/g, "")}${createHmac("sha256", env.ENCRYPTION_KEY).update(`tg:${userId}`).digest("hex").slice(0, 16)}`;
export function userFromLinkToken(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const hex = token.slice(0, 32);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return safeEqual(linkToken(id), token) ? id : null;
}

export async function setupTelegram(workspaceId: string, botToken: string, webhookSecret: string) {
  const me = await tg<{ username: string }>(botToken, "getMe", {});
  // Webhook needs public HTTPS; locally we still connect and allow manual chat IDs.
  let webhook = "not set (APP_URL is not public HTTPS — use manual chat ID)";
  if (env.APP_URL.startsWith("https://")) {
    await tg(botToken, "setWebhook", { url: telegramWebhookUrl(workspaceId), secret_token: webhookSecret, allowed_updates: ["message"] });
    webhook = "active";
  }
  return { botUsername: me.username, webhook };
}

/** I4.1–I4.4: alert the new owner on Telegram; failures are logged, retried with back-off, and visible to Admins. */
registerJob("notify_escalation", async (payload, workspaceId, meta) => {
  const ws = workspaceId!;
  const s = await getSecrets<TelegramSecrets>(ws, "telegram");
  const [row] = await db.select({ lead: schema.leads, contact: schema.contacts, user: schema.users })
    .from(schema.leads).innerJoin(schema.contacts, eq(schema.contacts.id, schema.leads.contactId)).innerJoin(schema.users, eq(schema.users.id, String(payload.userId) as never))
    .where(and(eq(schema.leads.id, String(payload.leadId)), eq(schema.leads.workspaceId, ws)));
  const ref = `lead:${payload.leadId}`;
  const fail = async (msg: string) => {
    await logEvent({ workspaceId: ws, provider: "telegram", direction: "outbound", kind: "escalation.alert", reference: ref, result: "failure", error: msg, detail: { userId: payload.userId, attempt: meta.attempt } });
    throw new PermanentError(msg);
  };
  if (!s) return fail("Telegram isn't connected for this workspace, so the escalation alert couldn't be sent.");
  if (!row) return fail("Lead or employee no longer exists.");
  if (!row.user.telegramChatId) return fail(`${row.user.name} hasn't linked Telegram, so they received only the in-app alert.`);

  const name = `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim();
  const link = `${env.APP_URL}/leads/${row.lead.id}`;
  const esc = (t: string) => t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
  const text = [
    `⚡ <b>Lead escalated to you</b>`,
    `<b>${esc(name)}</b> · ${esc(row.lead.source.replace("_", " "))}`,
    row.lead.message ? `“${esc(row.lead.message.slice(0, 200))}”` : null,
    `Reason: ${esc(String(payload.reason ?? "Not acknowledged in time"))}`,
    `Open: ${esc(link)}`,
  ].filter(Boolean).join("\n");
  try {
    await tg(s.botToken, "sendMessage", {
      chat_id: row.user.telegramChatId, text, parse_mode: "HTML", disable_web_page_preview: true,
      ...(link.startsWith("https://") ? { reply_markup: { inline_keyboard: [[{ text: "Open lead", url: link }]] } } : {}),
    });
    await markOk(ws, "telegram");
    await logEvent({ workspaceId: ws, provider: "telegram", direction: "outbound", kind: "escalation.alert", reference: ref, result: "success", detail: { userId: row.user.id } });
  } catch (e) {
    const err = e as { status?: number; message: string };
    const msg = explain("telegram", err.status, undefined, err.message);
    const transient = !err.status || err.status >= 500 || err.status === 429;
    await markError(ws, "telegram", msg, err.status === 401);
    await logEvent({ workspaceId: ws, provider: "telegram", direction: "outbound", kind: "escalation.alert", reference: ref, result: transient && !meta.final ? "retrying" : "failure", error: msg, detail: { attempt: meta.attempt } });
    if (transient) throw e;
    throw new PermanentError(msg);
  }
});

/** Inbound bot update: /start <token> links the employee's chat (I4.3). */
export async function handleTelegramUpdate(workspaceId: string, update: { message?: { chat: { id: number }; text?: string; from?: { username?: string } } }) {
  const m = update.message;
  if (!m?.text?.startsWith("/start")) return "ignored";
  const s = await getSecrets<TelegramSecrets>(workspaceId, "telegram");
  if (!s) return "not connected";
  const userId = userFromLinkToken(m.text.split(" ")[1] ?? "");
  const [u] = userId ? await db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.workspaceId, workspaceId))) : [];
  if (!u) {
    await tg(s.botToken, "sendMessage", { chat_id: m.chat.id, text: "This link isn't valid. Open Relay → Profile & alerts → Connect Telegram to get a fresh one." });
    return "bad token";
  }
  await db.update(schema.users).set({ telegramChatId: String(m.chat.id) }).where(eq(schema.users.id, u.id));
  await tg(s.botToken, "sendMessage", { chat_id: m.chat.id, text: `✅ Connected, ${u.name.split(" ")[0]}. You'll get a message here whenever a lead is escalated to you.` });
  return "linked";
}

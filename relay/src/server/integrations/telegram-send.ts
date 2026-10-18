import { ProviderError } from "./twilio";
import { explain, getSecrets, logEvent, markError, markOk } from "./store";
import { tg, type TelegramSecrets } from "./telegram";

/** Outbound customer message over the Telegram bot. Same failure contract as WhatsApp: transient → retry, permanent → visible reason. */
export async function sendTelegram(workspaceId: string, chatId: string, body: string, reference: string) {
  const s = await getSecrets<TelegramSecrets>(workspaceId, "telegram");
  if (!s) throw new ProviderError("Telegram isn't connected for this workspace. An Admin can connect the bot on the Integrations page.", false);
  try {
    const r = await tg<{ message_id: number }>(s.botToken, "sendMessage", { chat_id: chatId, text: body, disable_web_page_preview: false });
    await markOk(workspaceId, "telegram");
    await logEvent({ workspaceId, provider: "telegram", direction: "outbound", kind: "message.send", reference: `tg:${chatId}:${r.message_id}`, result: "success", detail: { messageId: reference } });
    // Telegram confirms delivery to the chat synchronously; there are no later status callbacks.
    return { sid: `tg:${chatId}:${r.message_id}`, status: "delivered" as const };
  } catch (e) {
    const err = e as { status?: number; message: string };
    const transient = !err.status || err.status >= 500 || err.status === 429;
    const msg = explain("telegram", err.status, undefined, err.message);
    await markError(workspaceId, "telegram", msg, err.status === 401);
    await logEvent({ workspaceId, provider: "telegram", direction: "outbound", kind: "message.send", reference, result: transient ? "retrying" : "failure", error: msg });
    throw new ProviderError(msg.replace("The employee", "The customer"), transient, err.status);
  }
}

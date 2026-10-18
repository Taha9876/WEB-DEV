import { getSecrets, logEvent } from "@/server/integrations/store";
import { safeEqual } from "@/server/crypto";
import { handleTelegramUpdate, type TelegramSecrets } from "@/server/integrations/telegram";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return new Response("Not found", { status: 404 });
  const s = await getSecrets<TelegramSecrets>(ws, "telegram");
  if (!s || !safeEqual(req.headers.get("x-telegram-bot-api-secret-token") ?? "", s.webhookSecret)) {
    await logEvent({ workspaceId: ws, provider: "telegram", direction: "inbound", kind: "update", result: "rejected", error: "Secret token mismatch" });
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const r = await handleTelegramUpdate(ws, await req.json());
    await logEvent({ workspaceId: ws, provider: "telegram", direction: "inbound", kind: "update", result: "success", detail: { outcome: r } });
  } catch (e) {
    await logEvent({ workspaceId: ws, provider: "telegram", direction: "inbound", kind: "update", result: "failure", error: String(e) });
  }
  return new Response("ok");
}

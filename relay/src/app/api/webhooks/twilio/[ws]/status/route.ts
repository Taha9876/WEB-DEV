import { getSecrets, logEvent } from "@/server/integrations/store";
import { explain } from "@/server/integrations/store";
import { twilioWebhookUrl, verifyTwilio, type TwilioSecrets } from "@/server/integrations/twilio";
import { updateStatus } from "@/server/domain/messaging";

export const runtime = "nodejs";

/** Delivery status callbacks: sent → delivered → read, or failed/undelivered with the provider's reason (I1.4). */
export async function POST(req: Request, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return new Response("Not found", { status: 404 });
  const form = await req.formData();
  const p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const secrets = await getSecrets<TwilioSecrets>(ws, "twilio");
  if (!secrets || !verifyTwilio(secrets.authToken, req.headers.get("x-twilio-signature"), twilioWebhookUrl(ws, "status"), p)) {
    await logEvent({ workspaceId: ws, provider: "twilio", direction: "inbound", kind: "message.status", reference: p.MessageSid ?? null, result: "rejected", error: "Signature verification failed" });
    return new Response("Invalid signature", { status: 403 });
  }
  const failed = p.MessageStatus === "failed" || p.MessageStatus === "undelivered";
  const found = await updateStatus(ws, p.MessageSid, p.MessageStatus, p.ErrorCode || undefined, failed ? explain("twilio", undefined, p.ErrorCode, `Delivery failed (code ${p.ErrorCode})`) : undefined);
  await logEvent({ workspaceId: ws, provider: "twilio", direction: "inbound", kind: "message.status", reference: p.MessageSid, result: found ? "success" : "failure",
    error: found ? (failed ? `Error ${p.ErrorCode}` : null) : "Unknown message", detail: { status: p.MessageStatus } });
  return new Response(null, { status: 204 });
}

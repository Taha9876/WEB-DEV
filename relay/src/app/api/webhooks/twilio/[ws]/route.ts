import { getSecrets, logEvent } from "@/server/integrations/store";
import { twilioWebhookUrl, verifyTwilio, type TwilioSecrets } from "@/server/integrations/twilio";
import { receiveMessage } from "@/server/domain/messaging";

export const runtime = "nodejs";
const twiml = (status = 200) => new Response("<Response/>", { status, headers: { "Content-Type": "text/xml" } });
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Inbound WhatsApp webhook, one URL per workspace so each is verified with its own token (I1.1, I1.2, I5.2). */
export async function POST(req: Request, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  if (!isUuid(ws)) return new Response("Not found", { status: 404 });
  const form = await req.formData();
  const p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const secrets = await getSecrets<TwilioSecrets>(ws, "twilio");
  if (!secrets) {
    await logEvent({ workspaceId: ws, provider: "twilio", direction: "inbound", kind: "message.received", reference: p.MessageSid, result: "rejected", error: "Twilio is not connected for this workspace" });
    return new Response("Not connected", { status: 404 });
  }
  if (!verifyTwilio(secrets.authToken, req.headers.get("x-twilio-signature"), twilioWebhookUrl(ws, "inbound"), p)) {
    await logEvent({ workspaceId: ws, provider: "twilio", direction: "inbound", kind: "message.received", reference: p.MessageSid ?? null, result: "rejected",
      error: "Signature verification failed — request was forged, altered, or APP_URL doesn't match the public webhook URL", detail: { from: p.From } });
    return new Response("Invalid signature", { status: 403 });
  }
  try {
    const r = await receiveMessage(ws, { sid: p.MessageSid, from: p.From, body: p.Body ?? "", profileName: p.ProfileName });
    await logEvent({ workspaceId: ws, provider: "twilio", direction: "inbound", kind: "message.received", reference: p.MessageSid, result: r.duplicate ? "duplicate" : "success",
      detail: r.duplicate ? {} : { contactId: r.contactId, newContact: r.isNew, leadId: r.leadId } });
    return twiml();
  } catch (e) {
    await logEvent({ workspaceId: ws, provider: "twilio", direction: "inbound", kind: "message.received", reference: p.MessageSid, result: "failure", error: String(e) });
    return twiml(500); // Twilio retries on 5xx
  }
}

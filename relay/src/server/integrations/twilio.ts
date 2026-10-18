import twilio from "twilio";
import { env } from "../env";
import { explain, getSecrets, isTransient, logEvent, markError, markOk } from "./store";

export type TwilioSecrets = { accountSid: string; authToken: string; from: string }; // from: "whatsapp:+14155238886"

export const twilioWebhookUrl = (workspaceId: string, kind: "inbound" | "status") =>
  `${env.APP_URL}/api/webhooks/twilio/${workspaceId}${kind === "status" ? "/status" : ""}`;

/** Verifies X-Twilio-Signature against this workspace's auth token and the public URL (I1.2). */
export function verifyTwilio(authToken: string, signature: string | null, url: string, params: Record<string, string>) {
  return !!signature && twilio.validateRequest(authToken, signature, url, params);
}

export class ProviderError extends Error {
  constructor(message: string, public transient: boolean, public code?: string | number) { super(message); }
}

export async function sendWhatsApp(workspaceId: string, toPhone: string, body: string, reference: string) {
  const s = await getSecrets<TwilioSecrets>(workspaceId, "twilio");
  if (!s) throw new ProviderError("WhatsApp isn't connected for this workspace. An Admin can connect Twilio on the Integrations page.", false);
  try {
    const client = twilio(s.accountSid, s.authToken, { timeout: 10_000 });
    const m = await client.messages.create({
      from: s.from.startsWith("whatsapp:") ? s.from : `whatsapp:${s.from}`, to: `whatsapp:${toPhone}`, body,
      statusCallback: twilioWebhookUrl(workspaceId, "status"),
    });
    await markOk(workspaceId, "twilio");
    await logEvent({ workspaceId, provider: "twilio", direction: "outbound", kind: "message.send", reference: m.sid, result: "success", detail: { messageId: reference, status: m.status } });
    return { sid: m.sid, status: m.status };
  } catch (e) {
    const err = e as { status?: number; code?: number | string; message?: string };
    const transient = isTransient(err.status, err.code);
    const msg = explain("twilio", err.status, err.code, err.message);
    await markError(workspaceId, "twilio", msg, err.status === 401 || String(err.code) === "20003");
    await logEvent({ workspaceId, provider: "twilio", direction: "outbound", kind: "message.send", reference, result: transient ? "retrying" : "failure", error: msg, detail: { status: err.status, code: err.code } });
    throw new ProviderError(msg, transient, err.code);
  }
}

export async function testTwilio(s: TwilioSecrets) {
  const client = twilio(s.accountSid, s.authToken, { timeout: 10_000 });
  const acct = await client.api.v2010.accounts(s.accountSid).fetch();
  return acct.friendlyName;
}

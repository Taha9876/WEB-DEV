import Stripe from "stripe";
import { claimEvent, getSecrets, logEvent, releaseEvent } from "@/server/integrations/store";
import { applyStripeEvent, type StripeSecrets } from "@/server/domain/payments";

export const runtime = "nodejs";

/** Stripe webhook: verify signature on the raw body before anything changes (I2.3), process each event id once (I2.4). */
export async function POST(req: Request, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return new Response("Not found", { status: 404 });
  const raw = await req.text();
  const s = await getSecrets<StripeSecrets>(ws, "stripe");
  if (!s) return new Response("Not connected", { status: 404 });

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", s.webhookSecret);
  } catch (e) {
    await logEvent({ workspaceId: ws, provider: "stripe", direction: "inbound", kind: "webhook", result: "rejected", error: `Signature verification failed: ${(e as Error).message}` });
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode) {
    await logEvent({ workspaceId: ws, provider: "stripe", direction: "inbound", kind: event.type, reference: event.id, result: "rejected", error: "Live-mode event refused — Relay runs Stripe in test mode only" });
    return new Response("Live mode not accepted", { status: 400 });
  }
  if (!(await claimEvent("stripe", event.id, ws))) {
    await logEvent({ workspaceId: ws, provider: "stripe", direction: "inbound", kind: event.type, reference: event.id, result: "duplicate" });
    return Response.json({ received: true, duplicate: true });
  }
  try {
    const r = await applyStripeEvent(ws, event);
    await logEvent({ workspaceId: ws, provider: "stripe", direction: "inbound", kind: event.type, reference: event.id,
      result: r.found ? "success" : "failure", error: r.found ? ("ignored" in r ? r.ignored ?? null : null) : "No matching payment in this workspace" });
    return Response.json({ received: true });
  } catch (e) {
    await releaseEvent("stripe", event.id); // let Stripe's retry reprocess it
    await logEvent({ workspaceId: ws, provider: "stripe", direction: "inbound", kind: event.type, reference: event.id, result: "failure", error: String(e) });
    return new Response("Processing failed", { status: 500 });
  }
}

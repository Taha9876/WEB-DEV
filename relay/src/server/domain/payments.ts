import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { env } from "../env";
import { publish } from "../realtime";
import { addActivity } from "./activity";
import { touchLeadsForContact } from "./leads";
import { explain, getSecrets, isTransient, logEvent, markError, markOk } from "../integrations/store";

export type StripeSecrets = { secretKey: string; webhookSecret: string; endpointId?: string };
const { payments, opportunities, contacts } = schema;
type Status = (typeof schema.paymentStatusEnum.enumValues)[number];

export const stripeWebhookUrl = (workspaceId: string) => `${env.APP_URL}/api/webhooks/stripe/${workspaceId}`;
export const STRIPE_EVENTS = ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "payment_intent.payment_failed", "charge.refunded"] as const;
export const stripeClient = (key: string) => new Stripe(key, { timeout: 15_000, maxNetworkRetries: 2 });

/** Allowed status moves — out-of-order or replayed events can never regress a payment (I2.4/I2.5). */
const NEXT: Record<Status, Status[]> = {
  pending: ["paid", "failed", "expired", "canceled"],
  failed: ["paid", "expired", "failed"],
  expired: ["paid"],
  canceled: [],
  paid: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded", "partially_refunded"],
  refunded: [],
};

/** I2.1 / I2.7 / I2.8 — hosted Checkout only; card details never touch Relay. */
export async function createPaymentRequest(ctx: Ctx, opportunityId: string, amountCents: number, currency: string, description?: string) {
  ctx.require("crm.edit", "request payments");
  if (!ctx.can("crm.view_value")) throw invalid("Your role can't see deal values, so it can't request payments either.");
  const [o] = await db.select({ o: opportunities, c: contacts }).from(opportunities).innerJoin(contacts, eq(contacts.id, opportunities.contactId))
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, ctx.workspaceId)));
  if (!o || (!ctx.can("crm.view_all") && o.o.ownerId !== ctx.userId)) throw notFound("Opportunity");
  const s = await getSecrets<StripeSecrets>(ctx.workspaceId, "stripe");
  if (!s) throw conflict("Payments aren't connected. An Admin can connect Stripe (test mode) on the Integrations page.");
  if (amountCents < 50) throw invalid("Stripe requires at least 0.50 in the chosen currency.", { amount: "Too small" });

  const [p] = await db.insert(payments).values({
    workspaceId: ctx.workspaceId, opportunityId, contactId: o.c.id, requestedBy: ctx.userId, amountCents, currency: currency.toLowerCase(), status: "pending",
  }).returning();
  try {
    const session = await stripeClient(s.secretKey).checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: amountCents, product_data: { name: description?.trim() || o.o.title } } }],
      customer_email: o.c.email ?? undefined,
      metadata: { workspaceId: ctx.workspaceId, paymentId: p.id, opportunityId },
      payment_intent_data: { metadata: { workspaceId: ctx.workspaceId, paymentId: p.id } },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h — expiry is observable in a demo
      success_url: `${env.APP_URL}/pay/thanks`, cancel_url: `${env.APP_URL}/pay/cancelled`,
    }, { idempotencyKey: `checkout-${p.id}` });
    const [u] = await db.update(payments).set({ checkoutSessionId: session.id, url: session.url, updatedAt: new Date() }).where(eq(payments.id, p.id)).returning();
    await markOk(ctx.workspaceId, "stripe");
    await logEvent({ workspaceId: ctx.workspaceId, provider: "stripe", direction: "outbound", kind: "checkout.create", reference: session.id, result: "success", detail: { paymentId: p.id } });
    await addActivity({ workspaceId: ctx.workspaceId, contactId: o.c.id, opportunityId, actorId: ctx.userId, type: "payment",
      summary: `Payment requested: ${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`, data: { paymentId: p.id } });
    await db.transaction((tx) => touchLeadsForContact(tx, ctx.workspaceId, o.c.id, ctx.userId, "payment request"));
    await publish(ctx.workspaceId, { type: "payment.updated", paymentId: p.id, opportunityId });
    return u;
  } catch (e) {
    const err = e as Stripe.errors.StripeError;
    const msg = explain("stripe", err.statusCode, err.code, err.message);
    await db.update(payments).set({ status: "canceled", updatedAt: new Date() }).where(eq(payments.id, p.id));
    await markError(ctx.workspaceId, "stripe", msg, err.statusCode === 401);
    await logEvent({ workspaceId: ctx.workspaceId, provider: "stripe", direction: "outbound", kind: "checkout.create", reference: p.id, result: "failure", error: msg });
    throw conflict(isTransient(err.statusCode) ? `${msg} Please try again.` : msg);
  }
}

async function transition(workspaceId: string, where: { id?: string; sessionId?: string; intentId?: string }, to: Status, patch: Partial<typeof payments.$inferInsert> = {}) {
  const cond = where.id ? eq(payments.id, where.id) : where.sessionId ? eq(payments.checkoutSessionId, where.sessionId) : eq(payments.paymentIntentId, where.intentId!);
  const [p] = await db.select().from(payments).where(and(cond, eq(payments.workspaceId, workspaceId)));
  if (!p) return { found: false as const };
  if (p.status !== to && !NEXT[p.status].includes(to)) return { found: true as const, ignored: `${p.status} → ${to} not allowed` };
  await db.update(payments).set({ status: to, ...patch, updatedAt: new Date() }).where(eq(payments.id, p.id));
  if (p.status !== to) {
    const amount = `${(p.amountCents / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
    const label: Record<Status, string> = { paid: `Payment received: ${amount}`, failed: `Payment attempt failed: ${amount}`, expired: `Payment link expired (abandoned): ${amount}`,
      canceled: `Payment request cancelled`, refunded: `Payment refunded: ${amount}`, partially_refunded: `Payment partially refunded`, pending: "Payment pending" };
    await addActivity({ workspaceId, contactId: p.contactId, opportunityId: p.opportunityId, type: "payment", summary: label[to], data: { paymentId: p.id, from: p.status, to } });
  }
  await publish(workspaceId, { type: "payment.updated", paymentId: p.id, opportunityId: p.opportunityId });
  return { found: true as const, paymentId: p.id };
}

/** I2.2 / I2.5 — every state the opportunity's payment can reach, driven only by verified webhooks. */
export async function applyStripeEvent(workspaceId: string, e: Stripe.Event) {
  switch (e.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = e.data.object as Stripe.Checkout.Session;
      if (s.payment_status !== "paid") return { found: true, ignored: "awaiting async payment" };
      return transition(workspaceId, { sessionId: s.id }, "paid", { paidAt: new Date(), paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null });
    }
    case "checkout.session.async_payment_failed":
      return transition(workspaceId, { sessionId: (e.data.object as Stripe.Checkout.Session).id }, "failed");
    case "checkout.session.expired":
      return transition(workspaceId, { sessionId: (e.data.object as Stripe.Checkout.Session).id }, "expired");
    case "payment_intent.payment_failed": {
      const pi = e.data.object as Stripe.PaymentIntent;
      return pi.metadata?.paymentId ? transition(workspaceId, { id: pi.metadata.paymentId }, "failed", { paymentIntentId: pi.id }) : { found: false };
    }
    case "charge.refunded": {
      const ch = e.data.object as Stripe.Charge;
      const intent = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (!intent) return { found: false };
      return transition(workspaceId, { intentId: intent }, ch.amount_refunded >= ch.amount ? "refunded" : "partially_refunded", { refundedCents: ch.amount_refunded });
    }
    default:
      return { found: true, ignored: `unhandled type ${e.type}` };
  }
}

export async function testStripe(s: StripeSecrets) {
  if (!s.secretKey.startsWith("sk_test_") && !s.secretKey.startsWith("rk_test_")) throw new Error("Use a test-mode key (sk_test_…). Live keys are refused.");
  if (!s.webhookSecret.startsWith("whsec_")) throw new Error("The webhook signing secret starts with whsec_.");
  const acct = await stripeClient(s.secretKey).balance.retrieve();
  return acct.livemode ? "live" : "test";
}

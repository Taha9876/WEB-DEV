/* Verifies rubric items against the RUNNING app + real DB, without provider accounts.
   Webhooks are sent to localhost with correctly computed signatures (and forged ones).
   Run while the server is up:  pnpm tsx scripts/rubric-check.ts */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import twilio from "twilio";
import Stripe from "stripe";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : JSON.stringify(info ?? "")); if (!ok) failed++; };
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

async function main() {
  const { db, schema, sql } = await import("../src/server/db");
  const { createWorkspace } = await import("../src/server/domain/workspace");
  const { ctxForUser } = await import("../src/server/context");
  const crm = await import("../src/server/domain/crm");
  const { saveRole } = await import("../src/server/domain/admin");
  const { saveConnection } = await import("../src/server/integrations/store");
  const { dashboard } = await import("../src/server/domain/metrics");
  const { hashPassword } = await import("../src/server/auth/password");

  const tag = Date.now().toString(36);
  const A = await createWorkspace({ workspaceName: `Rubric A ${tag}`, name: "Owner A", email: `ra-${tag}@t.dev`, password: "password1234" });
  const B = await createWorkspace({ workspaceName: `Rubric B ${tag}`, name: "Owner B", email: `rb-${tag}@t.dev`, password: "password1234" });
  const [sales] = await db.select().from(schema.roles).where(and(eq(schema.roles.workspaceId, A.workspace.id), eq(schema.roles.name, "Sales")));
  const [rep] = await db.insert(schema.users).values({ workspaceId: A.workspace.id, email: `rep-${tag}@t.dev`, name: "Rep", passwordHash: await hashPassword("password1234"), roleId: sales.id, status: "busy" }).returning();
  const ownerA = (await ctxForUser(A.owner.id))!, ownerB = (await ctxForUser(B.owner.id))!;
  const [pipe] = await db.select().from(schema.pipelines).where(eq(schema.pipelines.workspaceId, A.workspace.id));
  const contact = await crm.createContact(ownerA, { firstName: "Secret", lastName: "Customer", phone: "+923001234111" });
  await db.update(schema.contacts).set({ ownerId: rep.id }).where(eq(schema.contacts.id, contact.id));
  const opp = await crm.createOpportunity(ownerA, { contactId: contact.id, pipelineId: pipe.id, title: "Big deal", valueCents: 5_000_000 });
  await db.update(schema.opportunities).set({ ownerId: rep.id }).where(eq(schema.opportunities.id, opp.id));

  console.log("\n— 1. Roles, permissions, security");
  let repCtx = (await ctxForUser(rep.id))!;
  const board = await crm.listBoard(repCtx, pipe.id);
  check("deal value hidden from role without permission (server-side)", board.length === 1 && board[0].valueCents === null && board[0].valueMasked);
  check("export refused without crm.export", await throws(() => crm.exportContactsCsv(repCtx, [])));
  check("audit log refused without audit.view", await throws(async () => repCtx.require("audit.view")));
  check("another workspace cannot read this contact (guessed id → not found)", await throws(() => crm.getContactView(ownerB, contact.id)));
  check("another workspace cannot edit this contact", await throws(() => crm.updateContact(ownerB, contact.id, 1, { firstName: "Hacked" })));
  const http = await fetch(`${BASE}/api/export/contacts`);
  check("API without session → 401", http.status === 401);
  await saveRole(ownerA, sales.id, "Sales", [...sales.permissions, "crm.view_value"]);
  repCtx = (await ctxForUser(rep.id))!;
  check("permission granted in the UI layer takes effect immediately", (await crm.listBoard(repCtx, pipe.id))[0].valueCents === 5_000_000);

  console.log("\n— 5. Messaging webhooks (Twilio signature scheme)");
  const authToken = "test_auth_token_" + tag;
  await saveConnection(A.workspace.id, "twilio", { accountSid: "AC" + "0".repeat(32), authToken, from: "whatsapp:+14155238886" }, { from: "+14155238886" }, A.owner.id);
  const url = `${BASE}/api/webhooks/twilio/${A.workspace.id}`;
  const params = { From: "whatsapp:+923335550101", Body: "Salam, need a 5kW quote", MessageSid: `SM${tag}inbound`, ProfileName: "Zoya Test" };
  const post = (u: string, p: Record<string, string>, sig: string) => fetch(u, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": sig }, body: new URLSearchParams(p) });
  const good = twilio.getExpectedTwilioSignature(authToken, url, params);
  check("signed inbound message accepted", (await post(url, params, good)).status === 200);
  check("redelivered (duplicate) webhook accepted but ignored", (await post(url, params, good)).status === 200);
  const msgs = await db.select().from(schema.messages).where(eq(schema.messages.providerSid, params.MessageSid));
  const [zoya] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.workspaceId, A.workspace.id), eq(schema.contacts.phone, "+923335550101")));
  const zLeads = zoya ? await db.select().from(schema.leads).where(eq(schema.leads.contactId, zoya.id)) : [];
  check("unknown number → new contact + exactly one lead + one message", !!zoya && zLeads.length === 1 && msgs.length === 1, { msgs: msgs.length, leads: zLeads.length });
  check("forged signature rejected (403)", (await post(url, { ...params, MessageSid: `SM${tag}forged` }, "bm90LWEtcmVhbC1zaWc=")).status === 403);
  check("tampered body rejected (403)", (await post(url, { ...params, Body: "changed" }, good)).status === 403);
  const [rej] = await db.select().from(schema.integrationEvents).where(and(eq(schema.integrationEvents.workspaceId, A.workspace.id), eq(schema.integrationEvents.result, "rejected")));
  check("rejected webhook recorded in sync history", !!rej);
  // Outbound with fake credentials → Twilio refuses → visible failure with reason, retryable.
  const { sendMessage, retryMessage } = await import("../src/server/domain/messaging");
  const out = await sendMessage(ownerA, zoya.id, "Thanks Zoya, calling you shortly");
  let m = out; for (let i = 0; i < 20 && !["failed", "sent"].includes(m.status); i++) { await sleep(1000); [m] = await db.select().from(schema.messages).where(eq(schema.messages.id, out.id)); }
  check("provider failure → message visible as failed with a reason (worker)", m.status === "failed" && !!m.errorMessage, { status: m.status, err: m.errorMessage });
  check("failed message can be retried", !(await throws(() => retryMessage(ownerA, out.id))));
  await db.update(schema.contacts).set({ optedOut: true }).where(eq(schema.contacts.id, zoya.id));
  check("opted-out contact cannot be messaged", await throws(() => sendMessage(ownerA, zoya.id, "hi")));

  console.log("\n— 6. Payments webhooks (Stripe signature scheme)");
  const whsec = "whsec_test_" + tag;
  await saveConnection(A.workspace.id, "stripe", { secretKey: "sk_test_fake", webhookSecret: whsec }, { mode: "test" }, A.owner.id);
  const [pay] = await db.insert(schema.payments).values({ workspaceId: A.workspace.id, opportunityId: opp.id, contactId: contact.id, requestedBy: A.owner.id, amountCents: 125000, currency: "usd", checkoutSessionId: `cs_test_${tag}` }).returning();
  const surl = `${BASE}/api/webhooks/stripe/${A.workspace.id}`;
  const stripePost = (evt: object, secret = whsec) => { const payload = JSON.stringify(evt); return fetch(surl, { method: "POST", headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }), "Content-Type": "application/json" }, body: payload }); };
  const completed = { id: `evt_${tag}_1`, object: "event", type: "checkout.session.completed", livemode: false, data: { object: { id: `cs_test_${tag}`, object: "checkout.session", payment_status: "paid", payment_intent: `pi_${tag}` } } };
  check("signed payment webhook accepted", (await stripePost(completed)).status === 200);
  let [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay.id));
  check("payment marked paid automatically", p.status === "paid" && !!p.paidAt);
  await stripePost(completed);
  const d = await dashboard(ownerA);
  check("same event twice → counted once (collected = 1,250)", d.collectedThisMonth === 125000, d.collectedThisMonth);
  check("forged Stripe signature rejected (400)", (await stripePost({ ...completed, id: `evt_${tag}_x` }, "whsec_wrong")).status === 400);
  await stripePost({ id: `evt_${tag}_2`, object: "event", type: "charge.refunded", livemode: false, data: { object: { id: `ch_${tag}`, object: "charge", payment_intent: `pi_${tag}`, amount: 125000, amount_refunded: 125000 } } });
  [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay.id));
  check("refund in Stripe reflected (refunded)", p.status === "refunded");
  check("refund removed from collected revenue", (await dashboard(ownerA)).collectedThisMonth === 0);
  const [pay2] = await db.insert(schema.payments).values({ workspaceId: A.workspace.id, opportunityId: opp.id, contactId: contact.id, amountCents: 5000, currency: "usd", checkoutSessionId: `cs_test_${tag}_b` }).returning();
  await stripePost({ id: `evt_${tag}_3`, object: "event", type: "checkout.session.expired", livemode: false, data: { object: { id: `cs_test_${tag}_b`, object: "checkout.session" } } });
  [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay2.id));
  check("abandoned checkout shows as expired", p.status === "expired");

  console.log("\n— 9. Quality");
  check("health endpoint up", (await fetch(`${BASE}/api/health`)).ok);
  check("one failing provider (Twilio) did not break payments or the API", p.status === "expired");

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll rubric checks passed");
  await sql.end();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

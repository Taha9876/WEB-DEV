import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptJson, encryptJson, mask } from "../crypto";
import { audit } from "../audit";
import { publish } from "../realtime";

export type Provider = (typeof schema.providerEnum.enumValues)[number];
const { integrations, integrationEvents, processedEvents } = schema;

/** Server-only: decrypted credentials for one workspace's connection (I5.2, I5.3). */
export async function getSecrets<T>(workspaceId: string, provider: Provider): Promise<(T & { _public: Record<string, string> }) | null> {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
  if (!row?.secretsEnc || row.status === "not_connected") return null;
  return { ...decryptJson<T>(row.secretsEnc), _public: row.publicConfig };
}

export async function saveConnection(workspaceId: string, provider: Provider, secrets: Record<string, string>, publicConfig: Record<string, string>, actorId: string) {
  const [prev] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
  const values = { secretsEnc: encryptJson(secrets), publicConfig, status: "connected" as const, lastError: null, lastErrorAt: null, lastSuccessAt: new Date(), updatedBy: actorId, updatedAt: new Date() };
  if (prev) await db.update(integrations).set(values).where(eq(integrations.id, prev.id));
  else await db.insert(integrations).values({ workspaceId, provider, ...values });
  // Audit stores which keys changed and masked tails — never the secrets (I5.3, I5.7).
  await audit({ workspaceId, actorId, action: prev?.status === "connected" ? "integration.updated" : "integration.connected", targetType: "integration", targetId: provider,
    before: prev ? { status: prev.status, ...prev.publicConfig } : null,
    after: { status: "connected", ...publicConfig, secrets: Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, mask(v)])) } });
  await publish(workspaceId, { type: "integration.updated", provider });
}

export async function disconnect(workspaceId: string, provider: Provider, actorId: string) {
  const [prev] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
  if (!prev) return;
  await db.update(integrations).set({ status: "not_connected", secretsEnc: null, updatedBy: actorId, updatedAt: new Date() }).where(eq(integrations.id, prev.id));
  await audit({ workspaceId, actorId, action: "integration.disconnected", targetType: "integration", targetId: provider, before: { status: prev.status, ...prev.publicConfig }, after: { status: "not_connected" } });
  await publish(workspaceId, { type: "integration.updated", provider });
}

export async function markOk(workspaceId: string, provider: Provider) {
  await db.update(integrations).set({ lastSuccessAt: new Date(), status: "connected" })
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider), eq(integrations.status, "error")));
  await db.update(integrations).set({ lastSuccessAt: new Date() }).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
}

/** Permanent problems (bad credentials) flip status to error; transient ones only record lastError. */
export async function markError(workspaceId: string, provider: Provider, message: string, permanent = false) {
  await db.update(integrations).set({ lastError: message.slice(0, 500), lastErrorAt: new Date(), ...(permanent ? { status: "error" as const } : {}) })
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
  if (permanent) await publish(workspaceId, { type: "integration.updated", provider });
}

/** Synchronisation history: every inbound event and outbound call (I5.4). Never stores secrets or card data. */
export async function logEvent(e: {
  workspaceId: string | null; provider: Provider; direction: "inbound" | "outbound"; kind: string; reference?: string | null;
  result: "success" | "failure" | "rejected" | "duplicate" | "retrying"; error?: string | null; detail?: Record<string, unknown>;
}) {
  await db.insert(integrationEvents).values({
    workspaceId: e.workspaceId, provider: e.provider, direction: e.direction, kind: e.kind, reference: e.reference ?? null,
    result: e.result, error: e.error?.slice(0, 1000) ?? null, detail: e.detail ?? {},
  });
}

/** Idempotency claim for an inbound event id. Returns false if it was already processed (I1.8, I2.4). */
export async function claimEvent(provider: Provider, eventId: string, workspaceId: string) {
  const r = await db.insert(processedEvents).values({ provider, eventId, workspaceId }).onConflictDoNothing().returning();
  return r.length === 1;
}
export const releaseEvent = (provider: Provider, eventId: string) =>
  db.delete(processedEvents).where(and(eq(processedEvents.provider, provider), eq(processedEvents.eventId, eventId)));

/** Plain-language explanation for an error, so users know what to do (I5.5, Q10). */
export function explain(provider: Provider, status?: number, code?: string | number, raw?: string) {
  const c = String(code ?? "");
  if (provider === "twilio") {
    if (c === "20003" || status === 401) return "Twilio rejected the Account SID / Auth Token. Re-enter them on the Integrations page.";
    if (c === "63015" || c === "63016") return "WhatsApp sandbox: this number hasn't joined the sandbox, or the 24-hour reply window has closed. Ask the customer to send the join phrase first.";
    if (c === "21211" || c === "21614") return "This phone number isn't valid for WhatsApp.";
    if (c === "21610") return "The customer has blocked messages from this number (STOP).";
    if (c === "20429" || status === 429) return "Twilio rate limit reached — the message will be retried shortly.";
  }
  if (provider === "stripe") {
    if (status === 401) return "Stripe rejected the secret key. Use a test-mode key starting with sk_test_.";
    if (status === 429) return "Stripe rate limit reached — retrying shortly.";
  }
  if (provider === "telegram") {
    if (status === 401) return "Telegram rejected the bot token. Create a new one with @BotFather.";
    if (status === 403) return "The employee hasn't started a chat with the bot yet, or blocked it.";
    if (status === 400 && raw?.includes("chat not found")) return "Telegram chat not found — the employee needs to connect Telegram again.";
  }
  if (status && status >= 500) return "The provider is temporarily unavailable — Relay will retry automatically.";
  return raw ?? "Unexpected error from the provider.";
}

export const isTransient = (status?: number, code?: string | number) =>
  !status || status >= 500 || status === 429 || String(code) === "20429" || String(code) === "ETIMEDOUT" || String(code) === "ECONNRESET";

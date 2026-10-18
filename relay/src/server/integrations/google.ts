import { google, type calendar_v3 } from "googleapis";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { decryptJson, encryptJson } from "../crypto";
import { audit } from "../audit";
import { logEvent } from "./store";

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"];
type Tokens = { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string };

export const googleConfigured = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${env.APP_URL}/api/integrations/google/callback`;
const oauth = () => new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri());

export class CalendarError extends Error {
  constructor(message: string, public needsReconnect = false, public transient = false) { super(message); }
}

export function authUrl(state: string) {
  return oauth().generateAuthUrl({ access_type: "offline", prompt: "consent", include_granted_scopes: true, scope: SCOPES, state });
}

/** I3.1 — exchange the consent code; tokens are encrypted and never leave the server (I3.2). */
export async function completeConnection(workspaceId: string, userId: string, code: string) {
  const client = oauth();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new CalendarError("Google didn't return a refresh token. Remove Relay's access in your Google account and connect again.");
  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    email = ticket.getPayload()?.email ?? null;
  }
  const values = { workspaceId, userId, googleEmail: email, tokensEnc: encryptJson(tokens), expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null, status: "connected", lastError: null, updatedAt: new Date() };
  await db.insert(schema.calendarConnections).values(values).onConflictDoUpdate({ target: schema.calendarConnections.userId, set: values });
  await audit({ workspaceId, actorId: userId, action: "calendar.connected", targetType: "calendar_connection", targetId: userId, after: { googleEmail: email } });
  await logEvent({ workspaceId, provider: "google", direction: "outbound", kind: "oauth.connect", reference: email, result: "success" });
  return email;
}

export async function disconnectCalendar(workspaceId: string, userId: string, actorId: string) {
  const [c] = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.userId, userId));
  if (!c) return;
  try { const t = decryptJson<Tokens>(c.tokensEnc); if (t.refresh_token) await oauth().revokeToken(t.refresh_token); } catch { /* already revoked */ }
  await db.delete(schema.calendarConnections).where(eq(schema.calendarConnections.userId, userId));
  await audit({ workspaceId, actorId, action: "calendar.disconnected", targetType: "calendar_connection", targetId: userId, before: { googleEmail: c.googleEmail } });
}

async function markNeedsReconnect(workspaceId: string, userId: string, reason: string) {
  await db.update(schema.calendarConnections).set({ status: "needs_reconnect", lastError: reason, updatedAt: new Date() }).where(eq(schema.calendarConnections.userId, userId));
  await logEvent({ workspaceId, provider: "google", direction: "outbound", kind: "oauth.refresh", reference: userId, result: "failure", error: reason });
}

/** Authorised Calendar client for an employee; refreshed tokens are persisted automatically (I3.2). */
async function calendarFor(userId: string) {
  const [c] = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.userId, userId));
  if (!c) throw new CalendarError("This employee hasn't connected Google Calendar yet, so they can't be booked.", true);
  if (c.status !== "connected") throw new CalendarError("This employee's Google Calendar connection expired or was revoked. They need to reconnect it.", true);
  const client = oauth();
  client.setCredentials(decryptJson<Tokens>(c.tokensEnc));
  client.on("tokens", async (t) => {
    const merged = { ...decryptJson<Tokens>(c.tokensEnc), ...t };
    await db.update(schema.calendarConnections).set({ tokensEnc: encryptJson(merged), expiresAt: t.expiry_date ? new Date(t.expiry_date) : null, updatedAt: new Date() })
      .where(eq(schema.calendarConnections.userId, userId));
  });
  return { cal: google.calendar({ version: "v3", auth: client }), conn: c };
}

/** Runs a Calendar call, translating Google errors into plain explanations and detecting revoked access. */
async function call<T>(workspaceId: string, userId: string, kind: string, ref: string | null, fn: (cal: calendar_v3.Calendar) => Promise<T>): Promise<T> {
  const { cal } = await calendarFor(userId);
  try {
    const r = await fn(cal);
    await logEvent({ workspaceId, provider: "google", direction: "outbound", kind, reference: ref, result: "success" });
    return r;
  } catch (e) {
    const err = e as { code?: number | string; message?: string; response?: { data?: { error?: string } } };
    const grant = err.response?.data?.error === "invalid_grant" || String(err.message).includes("invalid_grant");
    if (grant || err.code === 401) {
      await markNeedsReconnect(workspaceId, userId, "Google access was revoked or expired");
      throw new CalendarError("Google Calendar access was revoked or expired. The employee needs to reconnect their calendar.", true);
    }
    const transient = !err.code || Number(err.code) >= 500 || err.code === 429;
    await logEvent({ workspaceId, provider: "google", direction: "outbound", kind, reference: ref, result: "failure", error: err.message ?? String(e) });
    throw new CalendarError(transient ? "Google Calendar is temporarily unavailable. Please try again in a moment." : `Google Calendar refused the request: ${err.message}`, false, transient);
  }
}

export async function busyTimes(workspaceId: string, userId: string, from: Date, to: Date) {
  return call(workspaceId, userId, "freebusy.query", null, async (cal) => {
    const r = await cal.freebusy.query({ requestBody: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] } });
    return (r.data.calendars?.primary?.busy ?? []).map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
  });
}

export async function createEvent(workspaceId: string, userId: string, e: { title: string; description: string; start: Date; end: Date; timezone: string; attendeeEmail?: string | null }) {
  return call(workspaceId, userId, "events.insert", null, async (cal) => {
    const r = await cal.events.insert({ calendarId: "primary", requestBody: {
      summary: e.title, description: e.description,
      start: { dateTime: e.start.toISOString(), timeZone: e.timezone }, end: { dateTime: e.end.toISOString(), timeZone: e.timezone },
      attendees: e.attendeeEmail ? [{ email: e.attendeeEmail }] : undefined,
    } });
    return r.data.id!;
  });
}

export async function patchEvent(workspaceId: string, userId: string, eventId: string, e: { start: Date; end: Date; timezone: string }) {
  return call(workspaceId, userId, "events.patch", eventId, (cal) => cal.events.patch({ calendarId: "primary", eventId,
    requestBody: { start: { dateTime: e.start.toISOString(), timeZone: e.timezone }, end: { dateTime: e.end.toISOString(), timeZone: e.timezone } } }).then(() => undefined));
}

export async function deleteEvent(workspaceId: string, userId: string, eventId: string) {
  return call(workspaceId, userId, "events.delete", eventId, async (cal) => {
    try { await cal.events.delete({ calendarId: "primary", eventId }); } catch (e) { if ((e as { code?: number }).code !== 410) throw e; } // already gone
  });
}

import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "relay_session";
const TTL_MS = 7 * 24 * 3600 * 1000;

export async function createSession(userId: string) {
  const token = randomToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(schema.sessions).values({
    id: sha256(token), userId, expiresAt,
    ip: h.get("x-forwarded-for")?.split(",")[0] ?? null,
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export const destroyAllSessions = (userId: string) =>
  db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));

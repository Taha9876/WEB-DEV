import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "./db";
import { sha256 } from "./crypto";
import { SESSION_COOKIE } from "./auth/session";
import { ALL_PERMISSIONS, type Permission } from "./permissions";
import { forbidden, unauthorized } from "./errors";

export type Ctx = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  user: typeof schema.users.$inferSelect;
  roleName: string | null;
  perms: ReadonlySet<Permission>;
  can: (p: Permission) => boolean;
  /** Throws 403 unless permitted. Every mutation calls this server-side (F1.5). */
  require: (p: Permission, what?: string) => void;
};

type Row = { user: typeof schema.users.$inferSelect; ws: typeof schema.workspaces.$inferSelect; role: typeof schema.roles.$inferSelect | null };

function toCtx(row: Row): Ctx {
  const perms = new Set<Permission>(
    row.user.level === "owner" ? ALL_PERMISSIONS : ((row.role?.permissions ?? []) as Permission[]),
  );
  const can = (p: Permission) => perms.has(p);
  return {
    userId: row.user.id, workspaceId: row.ws.id, workspaceName: row.ws.name, user: row.user,
    roleName: row.user.level === "owner" ? "Owner" : row.role?.name ?? null,
    perms, can,
    require: (p, what) => { if (!can(p)) throw forbidden(what ?? p); },
  };
}

/** Resolves the caller from the session cookie. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: schema.users, ws: schema.workspaces, role: schema.roles })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.users.workspaceId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.user.deactivatedAt) return null;
  return toCtx(row);
});

/** Context for background work acting on a user's behalf (scheduled reports) — same permissions as that user. */
export async function ctxForUser(userId: string): Promise<Ctx | null> {
  const [row] = await db.select({ user: schema.users, ws: schema.workspaces, role: schema.roles }).from(schema.users)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.users.workspaceId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.id, userId)).limit(1);
  return row && !row.user.deactivatedAt ? toCtx(row) : null;
}

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw unauthorized();
  return ctx;
}

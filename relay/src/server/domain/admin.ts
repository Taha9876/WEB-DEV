import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import type { Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { randomToken, sha256 } from "../crypto";
import { hashPassword } from "../auth/password";
import { destroyAllSessions } from "../auth/session";
import { ALL_PERMISSIONS, isPermission, type Permission } from "../permissions";
import { handleAbsence } from "./leads";
import { env } from "../env";

const { users, roles, invites } = schema;
type Level = "owner" | "admin" | "user";

export async function listTeam(ctx: Ctx) {
  return db.select({
    id: users.id, name: users.name, email: users.email, level: users.level, roleId: users.roleId, roleName: roles.name, status: users.status,
    timezone: users.timezone, deactivatedAt: users.deactivatedAt, telegram: users.telegramChatId,
    openLeads: sql<number>`(select count(*)::int from leads l where l.owner_id = ${users.id} and l.status in ('assigned','acknowledged'))`,
  }).from(users).leftJoin(roles, eq(roles.id, users.roleId)).where(eq(users.workspaceId, ctx.workspaceId)).orderBy(sql`case ${users.level} when 'owner' then 0 when 'admin' then 1 else 2 end`, asc(users.name));
}

export const listRoles = (ctx: Ctx) => db.select().from(roles).where(eq(roles.workspaceId, ctx.workspaceId)).orderBy(asc(roles.name));

/** F1.2 — the Owner is untouchable by Admins; nobody but the Owner hands out Owner-level power. */
function guard(ctx: Ctx, target: { id: string; level: Level }, newLevel?: Level) {
  ctx.require("users.manage", "manage users");
  if (target.level === "owner" && ctx.user.level !== "owner") throw forbidden("modify the Owner");
  if (target.id === ctx.userId && newLevel && newLevel !== ctx.user.level) throw forbidden("change your own level");
  if (newLevel === "owner") throw forbidden("make someone else Owner (ownership transfer isn't supported)");
  if (newLevel === "admin" && ctx.user.level !== "owner" && ctx.user.level !== "admin") throw forbidden("grant Admin level");
}

async function member(ctx: Ctx, id: string) {
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.workspaceId, ctx.workspaceId)));
  if (!u) throw notFound("Team member");
  return u;
}

export async function invite(ctx: Ctx, email: string, level: Level, roleId: string | null) {
  guard(ctx, { id: "", level: "user" }, level);
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw conflict("Someone with this email already has a Relay account.");
  if (roleId) { const [r] = await db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.workspaceId, ctx.workspaceId))); if (!r) throw notFound("Role"); }
  const token = randomToken(24);
  const [inv] = await db.insert(invites).values({ workspaceId: ctx.workspaceId, email, level, roleId, tokenHash: sha256(token), invitedBy: ctx.userId, expiresAt: new Date(Date.now() + 7 * 86_400_000) }).returning();
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "user.invited", targetType: "invite", targetId: inv.id, after: { email, level, roleId } });
  return `${env.APP_URL}/invite/${token}`;
}

export async function pendingInvites(ctx: Ctx) {
  return db.select({ id: invites.id, email: invites.email, level: invites.level, expiresAt: invites.expiresAt }).from(invites)
    .where(and(eq(invites.workspaceId, ctx.workspaceId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
}

export async function lookupInvite(token: string) {
  const [i] = await db.select({ inv: invites, ws: schema.workspaces.name }).from(invites).innerJoin(schema.workspaces, eq(schema.workspaces.id, invites.workspaceId))
    .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  return i ?? null;
}

export async function acceptInvite(token: string, name: string, password: string, timezone: string) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [i] = await tx.select().from(invites).where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))).for("update");
    if (!i) throw invalid("This invitation is invalid or has expired. Ask your admin for a new one.");
    const [u] = await tx.insert(users).values({ workspaceId: i.workspaceId, email: i.email, name, passwordHash, level: i.level, roleId: i.roleId, status: "available", timezone }).returning();
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, i.id));
    await audit({ workspaceId: i.workspaceId, actorId: u.id, action: "user.joined", targetType: "user", targetId: u.id, after: { email: i.email, level: i.level } }, tx);
    return u;
  });
}

export async function updateMember(ctx: Ctx, id: string, patch: { level?: Level; roleId?: string | null }) {
  const u = await member(ctx, id);
  guard(ctx, u, patch.level);
  if (patch.roleId) { const [r] = await db.select().from(roles).where(and(eq(roles.id, patch.roleId), eq(roles.workspaceId, ctx.workspaceId))); if (!r) throw notFound("Role"); }
  const next = { level: patch.level ?? u.level, roleId: patch.roleId !== undefined ? patch.roleId : u.roleId };
  await db.update(users).set(next).where(eq(users.id, id));
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "user.role_changed", targetType: "user", targetId: id, before: { level: u.level, roleId: u.roleId }, after: next });
}

/** Users are deactivated, never deleted — history keeps its actors (Q4). Their open leads move on. */
export async function setActive(ctx: Ctx, id: string, active: boolean) {
  const u = await member(ctx, id);
  guard(ctx, u);
  if (id === ctx.userId) throw forbidden("deactivate yourself");
  await db.update(users).set({ deactivatedAt: active ? null : new Date(), status: active ? u.status : "offline" }).where(eq(users.id, id));
  if (!active) {
    await destroyAllSessions(id);
    // A deactivated user can't own anything: acknowledged leads move too, through the normal assignment path.
    await handleAbsence(ctx.workspaceId, id, ctx.userId, true);
  }
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: active ? "user.reactivated" : "user.deactivated", targetType: "user", targetId: id, before: { active: !u.deactivatedAt }, after: { active } });
}

/** F1.3 — permissions are data, edited per role; names are never checked. */
export async function saveRole(ctx: Ctx, id: string | null, name: string, perms: string[]) {
  ctx.require("users.manage", "manage roles");
  const clean = [...new Set(perms.filter(isPermission))] as Permission[];
  if (id) {
    const [r] = await db.select().from(roles).where(and(eq(roles.id, id), eq(roles.workspaceId, ctx.workspaceId)));
    if (!r) throw notFound("Role");
    // An Admin can't grant permissions they don't hold themselves.
    const escalate = clean.filter((p) => !ctx.can(p) && !r.permissions.includes(p));
    if (escalate.length) throw forbidden(`grant permissions you don't have (${escalate.join(", ")})`);
    await db.update(roles).set({ name: name.trim(), permissions: clean }).where(eq(roles.id, id));
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "role.updated", targetType: "role", targetId: id, before: { name: r.name, permissions: r.permissions }, after: { name, permissions: clean } });
    return id;
  }
  const escalate = clean.filter((p) => !ctx.can(p));
  if (escalate.length) throw forbidden(`grant permissions you don't have (${escalate.join(", ")})`);
  try {
    const [r] = await db.insert(roles).values({ workspaceId: ctx.workspaceId, name: name.trim(), permissions: clean }).returning();
    await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "role.created", targetType: "role", targetId: r.id, after: { name, permissions: clean } });
    return r.id;
  } catch (e) {
    if (String(e).includes("roles_ws_name")) throw conflict("A role with that name already exists.");
    throw e;
  }
}

export async function deleteRole(ctx: Ctx, id: string) {
  ctx.require("users.manage", "manage roles");
  const [r] = await db.select().from(roles).where(and(eq(roles.id, id), eq(roles.workspaceId, ctx.workspaceId)));
  if (!r) throw notFound("Role");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.roleId, id));
  if (n) throw conflict(`${n} team member(s) still have this role. Give them another role first.`);
  await db.delete(roles).where(eq(roles.id, id));
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "role.deleted", targetType: "role", targetId: id, before: r });
}

export { ALL_PERMISSIONS };

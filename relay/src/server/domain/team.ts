import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { publish } from "../realtime";
import { forbidden, notFound } from "../errors";
import { handleAbsence } from "./leads";
import type { Ctx } from "../context";

export type Availability = (typeof schema.availabilityEnum.enumValues)[number];

/** F3.2 + F3.6 — self or a manager sets status; leaving triggers immediate reassignment. */
export async function setAvailability(ctx: Ctx, userId: string, status: Availability) {
  if (userId !== ctx.userId) ctx.require("leads.manage", "change a teammate's availability");
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.workspaceId, ctx.workspaceId)));
  if (!u) throw notFound("Employee");
  if (u.level === "owner" && ctx.user.level !== "owner" && userId !== ctx.userId) throw forbidden("modify the Owner");
  if (u.status === status) return { moved: 0 };
  await db.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
  await audit({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "user.availability_changed", targetType: "user", targetId: userId, before: { status: u.status }, after: { status } });
  await publish(ctx.workspaceId, { type: "availability.changed", userId });
  const moved = status === "on_leave" || status === "offline" ? await handleAbsence(ctx.workspaceId, userId, ctx.userId) : 0;
  return { moved };
}

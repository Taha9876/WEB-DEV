"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import * as A from "@/server/domain/admin";

const id = z.string().uuid();
const level = z.enum(["owner", "admin", "user"]);
const done = () => { revalidatePath("/settings/team"); revalidatePath("/settings/roles"); };

export async function inviteAction(email: string, lvl: string, roleId: string) {
  return run(async () => {
    const link = await A.invite(await requireCtx(), z.string().trim().toLowerCase().email("Enter a valid email").parse(email), level.parse(lvl), roleId ? id.parse(roleId) : null);
    done();
    return { link };
  });
}
export async function updateMemberAction(userId: string, patch: { level?: string; roleId?: string | null }) {
  return run(async () => {
    await A.updateMember(await requireCtx(), id.parse(userId), { level: patch.level ? level.parse(patch.level) : undefined, roleId: patch.roleId === undefined ? undefined : patch.roleId ? id.parse(patch.roleId) : null });
    done();
  });
}
export async function setActiveAction(userId: string, active: boolean) {
  return run(async () => { await A.setActive(await requireCtx(), id.parse(userId), z.boolean().parse(active)); done(); });
}
export async function saveRoleAction(roleId: string | null, name: string, perms: string[]) {
  return run(async () => {
    const r = await A.saveRole(await requireCtx(), roleId ? id.parse(roleId) : null, z.string().trim().min(1, "Name the role").max(40).parse(name), z.array(z.string().max(40)).max(40).parse(perms));
    done();
    return { id: r };
  });
}
export async function deleteRoleAction(roleId: string) {
  return run(async () => { await A.deleteRole(await requireCtx(), id.parse(roleId)); done(); });
}

import { requireCtx } from "@/server/context";
import { listRoles } from "@/server/domain/admin";
import { PERMISSIONS } from "@/server/permissions";
import { RolesView } from "@/components/settings/roles-view";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireCtx();
  ctx.require("users.manage", "manage roles");
  const roles = await listRoles(ctx);
  return <RolesView roles={roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions }))} catalog={PERMISSIONS} mine={[...ctx.perms]} />;
}

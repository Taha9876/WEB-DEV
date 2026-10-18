import { requireCtx } from "@/server/context";
import { listRoles, listTeam, pendingInvites } from "@/server/domain/admin";
import { TeamView } from "@/components/settings/team-view";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireCtx();
  const manage = ctx.can("users.manage");
  const [team, roles, invites] = await Promise.all([listTeam(ctx), listRoles(ctx), manage ? pendingInvites(ctx) : []]);
  const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x));
  return <TeamView team={ser(team)} roles={roles.map((r) => ({ id: r.id, name: r.name }))} invites={ser(invites)}
    me={{ id: ctx.userId, level: ctx.user.level }} can={{ users: manage, availability: ctx.can("leads.manage") }} />;
}

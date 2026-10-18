import { db, schema } from "../db";
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { DEFAULT_ROLES } from "../permissions";
import { randomToken } from "../crypto";

/** F1.1 — sign-up creates a workspace and makes the first user its Owner, with sensible defaults. */
export async function createWorkspace(input: { workspaceName: string; name: string; email: string; password: string; timezone?: string }) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const slug = `${input.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "ws"}-${randomToken(4).toLowerCase()}`;
    const [ws] = await tx.insert(schema.workspaces).values({ name: input.workspaceName, slug }).returning();
    await tx.insert(schema.roles).values(DEFAULT_ROLES.map((r) => ({ workspaceId: ws.id, name: r.name, permissions: r.permissions })));
    const [owner] = await tx.insert(schema.users).values({
      workspaceId: ws.id, email: input.email, name: input.name, passwordHash, level: "owner", status: "available",
      timezone: input.timezone ?? "UTC",
    }).returning();

    const [pipe] = await tx.insert(schema.pipelines).values({ workspaceId: ws.id, name: "Sales", position: 0 }).returning();
    await tx.insert(schema.stages).values(
      (["New", "Qualified", "Proposal", "Won", "Lost"] as const).map((name, i) => ({
        workspaceId: ws.id, pipelineId: pipe.id, name, position: i, kind: name === "Won" ? "won" as const : name === "Lost" ? "lost" as const : "open" as const,
      })),
    );
    // Demo-friendly defaults: short windows so escalation is observable in seconds.
    await tx.insert(schema.leadSettings).values({
      workspaceId: ws.id, ackWindowSeconds: 60, maxOpenLeads: 10, idleSeconds: 3600,
      escalationChain: [{ type: "next_eligible", seconds: 60 }, { type: "manager", seconds: 120, userId: owner.id }],
    });
    await audit({ workspaceId: ws.id, actorId: owner.id, action: "workspace.created", targetType: "workspace", targetId: ws.id, after: { name: ws.name } }, tx);
    return { workspace: ws, owner };
  });
}

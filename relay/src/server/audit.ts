import { db, schema, type Tx } from "./db";

export type AuditEntry = {
  workspaceId: string;
  actorId: string | null; // null = system
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Append-only. The table rejects UPDATE/DELETE via trigger (F4.3). */
export async function audit(e: AuditEntry, tx: Tx | typeof db = db) {
  await tx.insert(schema.auditLogs).values({
    workspaceId: e.workspaceId, actorId: e.actorId, action: e.action,
    targetType: e.targetType, targetId: e.targetId ?? null,
    before: e.before ?? null, after: e.after ?? null,
  });
}

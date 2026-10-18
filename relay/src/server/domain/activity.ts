import { db, schema, type Tx } from "../db";

export type ActivityInput = {
  workspaceId: string;
  contactId?: string | null;
  opportunityId?: string | null;
  leadId?: string | null;
  actorId?: string | null;
  type: string;
  summary: string;
  data?: Record<string, unknown>;
};

export async function addActivity(a: ActivityInput, tx: Tx | typeof db = db) {
  await tx.insert(schema.activities).values({
    workspaceId: a.workspaceId, contactId: a.contactId ?? null, opportunityId: a.opportunityId ?? null,
    leadId: a.leadId ?? null, actorId: a.actorId ?? null, type: a.type, summary: a.summary, data: a.data ?? {},
  });
}

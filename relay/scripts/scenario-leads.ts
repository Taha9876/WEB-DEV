/* End-to-end check of the lead engine against the real database. Run: pnpm tsx scripts/scenario-leads.ts */
import "dotenv/config";
import { eq } from "drizzle-orm";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : info ?? ""); if (!ok) failed++; };

async function main() {
  const { db, schema, sql } = await import("../src/server/db");
  const { createWorkspace } = await import("../src/server/domain/workspace");
  const L = await import("../src/server/domain/leads");
  const { hashPassword } = await import("../src/server/auth/password");

  const tag = Date.now().toString(36);
  const { workspace: ws, owner } = await createWorkspace({ workspaceName: `Scenario ${tag}`, name: "Owner", email: `owner-${tag}@test.dev`, password: "password1234" });
  const pw = await hashPassword("password1234");
  const mk = async (name: string, status: "available" | "busy" | "on_leave" | "offline" = "available") =>
    (await db.insert(schema.users).values({ workspaceId: ws.id, email: `${name}-${tag}@test.dev`, name, passwordHash: pw, status }).returning())[0];
  // Owner is the manager; make them not Available so round-robin uses the team.
  await db.update(schema.users).set({ status: "busy" }).where(eq(schema.users.id, owner.id));
  const a = await mk("Ayesha"), b = await mk("Bilal"), c = await mk("Hina"), d = await mk("Dawood", "on_leave");
  await db.update(schema.leadSettings).set({
    ackWindowSeconds: 1, maxOpenLeads: 2,
    escalationChain: [{ type: "next_eligible", seconds: 1 }, { type: "backup", seconds: 1, userId: c.id }, { type: "manager", seconds: 1, userId: owner.id }],
  }).where(eq(schema.leadSettings.workspaceId, ws.id));

  const contact = async (n: string) => (await db.insert(schema.contacts).values({ workspaceId: ws.id, firstName: n }).returning())[0];
  const get = async (id: string) => (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0];

  // 1. Initial assignment never goes to non-Available people
  const l1 = await L.createLead({ workspaceId: ws.id, contactId: (await contact("Sara")).id, source: "web_form" });
  check("initial owner is Available employee", [a.id, b.id, c.id].includes(l1.ownerId!), l1.ownerId);
  check("deadline set", !!l1.ackDeadline);

  // 2. Two workers firing together escalate once (F3.8)
  await sleep(1200);
  const [n1, n2] = await Promise.all([L.escalateDue(), L.escalateDue()]);
  let s1 = await get(l1.id);
  check("concurrent expiry escalates exactly once", n1 + n2 === 1 && s1.escalationCount === 1, { n1, n2, count: s1.escalationCount });
  check("escalated to a different person", s1.ownerId !== l1.ownerId);
  const assigns = await db.select().from(schema.leadAssignments).where(eq(schema.leadAssignments.leadId, l1.id));
  check("exactly one open assignment row", assigns.filter((x) => !x.endedAt).length === 1, assigns.length);

  // 3. Walk the chain to the manager, then exhaustion
  for (let i = 0; i < 4; i++) { await sleep(1100); await L.escalateDue(); }
  s1 = await get(l1.id);
  check("chain ends with manager (owner) holding it", s1.ownerId === owner.id, s1);
  check("exhausted, timer stopped", !!s1.exhaustedAt && !s1.ackDeadline);
  const q = await L.recoveryQueue(ws.id);
  const item = q.find((x) => x.id === l1.id);
  check("in recovery queue with reasons", !!item && item.reasons.length >= 2, item?.reasons);

  // 4. Acknowledge by a non-owner is refused; by owner works
  const l2 = await L.createLead({ workspaceId: ws.id, contactId: (await contact("Omar")).id, source: "manual" });
  const other = [a, b, c].find((u) => u.id !== l2.ownerId)!;
  let refused = false;
  try { await L.acknowledge(ws.id, l2.id, other.id); } catch { refused = true; }
  check("non-owner cannot acknowledge", refused);
  await L.acknowledge(ws.id, l2.id, l2.ownerId!);
  const s2 = await get(l2.id);
  check("owner acknowledges; first response recorded", s2.status === "acknowledged" && !!s2.firstAcknowledgedAt);

  // 5. Absence: unacknowledged leads move immediately (F3.6)
  const l3 = await L.createLead({ workspaceId: ws.id, contactId: (await contact("Zara")).id, source: "whatsapp" });
  const holder = l3.ownerId!;
  await db.update(schema.users).set({ status: "on_leave" }).where(eq(schema.users.id, holder));
  const moved = await L.handleAbsence(ws.id, holder, null);
  const s3 = await get(l3.id);
  check("absence reassigns unacknowledged lead", moved >= 1 && s3.ownerId !== holder && s3.ownerId !== d.id, { moved, owner: s3.ownerId });

  // 6. Capacity: when nobody is eligible the lead waits unassigned (and is in the queue)
  await db.update(schema.users).set({ status: "offline" }).where(eq(schema.users.workspaceId, ws.id));
  const l4 = await L.createLead({ workspaceId: ws.id, contactId: (await contact("Ali")).id, source: "web_form" });
  check("no eligible employee → unassigned", l4.status === "unassigned" && !l4.ownerId);
  await db.update(schema.users).set({ status: "available" }).where(eq(schema.users.id, a.id));
  await L.assignWaiting();
  check("picked up when someone becomes available", (await get(l4.id)).ownerId === a.id);

  // 7. Audit trail is append-only
  let blocked = false;
  try { await sql`delete from audit_logs where workspace_id = ${ws.id}`; } catch { blocked = true; }
  check("audit log cannot be deleted", blocked);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll lead-engine checks passed");
  await sql.end();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

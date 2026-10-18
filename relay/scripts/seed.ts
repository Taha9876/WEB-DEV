/* Demo workspace with realistic data. Run: pnpm seed   (idempotent per email — re-running makes a fresh workspace) */
import "dotenv/config";
import { eq } from "drizzle-orm";

async function main() {
  const { db, schema, sql } = await import("../src/server/db");
  const { createWorkspace } = await import("../src/server/domain/workspace");
  const { createLead, acknowledge } = await import("../src/server/domain/leads");
  const { hashPassword } = await import("../src/server/auth/password");
  const { addActivity } = await import("../src/server/domain/activity");

  const stamp = Date.now().toString(36).slice(-4);
  const ownerEmail = process.env.SEED_EMAIL ?? `owner+${stamp}@sunrise.demo`;
  const password = "relay-demo-2026";
  const { workspace: ws, owner } = await createWorkspace({ workspaceName: "Sunrise Solar", name: "Taha Ahmed", email: ownerEmail, password, timezone: "Asia/Karachi" });
  const roles = await db.select().from(schema.roles).where(eq(schema.roles.workspaceId, ws.id));
  const role = (n: string) => roles.find((r) => r.name === n)!.id;
  const pw = await hashPassword(password);
  const mk = async (name: string, level: "admin" | "user", r: string, status: "available" | "busy" | "on_leave" | "offline", tz = "Asia/Karachi") =>
    (await db.insert(schema.users).values({ workspaceId: ws.id, name, email: `${name.split(" ")[0].toLowerCase()}+${stamp}@sunrise.demo`, passwordHash: pw, level, roleId: role(r), status, timezone: tz }).returning())[0];
  const admin = await mk("Sana Malik", "admin", "Admin", "busy");
  const manager = await mk("Hina Shah", "user", "Manager", "available");
  const ayesha = await mk("Ayesha Raza", "user", "Sales", "available");
  const bilal = await mk("Bilal Khan", "user", "Sales", "available", "Asia/Dubai");
  const omar = await mk("Omar Farooq", "user", "Sales", "on_leave");
  await db.update(schema.users).set({ status: "busy" }).where(eq(schema.users.id, owner.id));
  await db.update(schema.leadSettings).set({
    ackWindowSeconds: 45, maxOpenLeads: 6, idleSeconds: 600,
    escalationChain: [{ type: "next_eligible", seconds: 30 }, { type: "backup", seconds: 30, userId: manager.id }, { type: "manager", seconds: 60, userId: owner.id }],
  }).where(eq(schema.leadSettings.workspaceId, ws.id));

  // Custom fields: shared contact fields + a pipeline-specific opportunity set with a stage gate.
  const [pipe] = await db.select().from(schema.pipelines).where(eq(schema.pipelines.workspaceId, ws.id));
  const stages = await db.select().from(schema.stages).where(eq(schema.stages.pipelineId, pipe.id));
  const st = (n: string) => stages.find((s) => s.name === n)!;
  const qualified = st("Qualified");
  await db.update(schema.stages).set({ name: "Site survey" }).where(eq(schema.stages.id, qualified.id));
  qualified.name = "Site survey";
  await db.insert(schema.customFields).values([
    { workspaceId: ws.id, entity: "contact", key: "city", label: "City", type: "dropdown", options: ["Lahore", "Karachi", "Islamabad", "Dubai"], position: 0 },
    { workspaceId: ws.id, entity: "contact", key: "monthly_bill", label: "Monthly bill (PKR)", type: "number", options: [], position: 1 },
    { workspaceId: ws.id, entity: "contact", key: "owns_property", label: "Owns property", type: "checkbox", options: [], position: 2 },
  ]);
  const [sizeF, roofF, surveyF] = await db.insert(schema.customFields).values([
    { workspaceId: ws.id, entity: "opportunity", pipelineId: pipe.id, key: "system_kw", label: "System size (kW)", type: "number", options: [], position: 0 },
    { workspaceId: ws.id, entity: "opportunity", pipelineId: pipe.id, key: "roof_type", label: "Roof type", type: "dropdown", options: ["Flat", "Pitched", "Metal"], position: 1 },
    { workspaceId: ws.id, entity: "opportunity", pipelineId: pipe.id, key: "survey_date", label: "Survey date", type: "date", options: [], position: 2 },
  ]).returning();
  await db.insert(schema.stageRequiredFields).values([{ stageId: st("Proposal").id, fieldId: sizeF.id }, { stageId: st("Proposal").id, fieldId: surveyF.id }, { stageId: qualified.id, fieldId: roofF.id }]);

  // Second pipeline with its own fields (F2.3).
  const [comm] = await db.insert(schema.pipelines).values({ workspaceId: ws.id, name: "Commercial", position: 1 }).returning();
  const commStages = await db.insert(schema.stages).values(["Inquiry", "Energy audit", "Tender", "Won", "Lost"].map((name, i) => ({ workspaceId: ws.id, pipelineId: comm.id, name, position: i, kind: name === "Won" ? "won" as const : name === "Lost" ? "lost" as const : "open" as const }))).returning();
  await db.insert(schema.customFields).values({ workspaceId: ws.id, entity: "opportunity", pipelineId: comm.id, key: "annual_kwh", label: "Annual consumption (kWh)", type: "number", options: [], position: 0 });

  const people = [
    ["Sara", "Khan", "+923001110001", "Lahore", 38000, "web_form", "Need a quote for a 10kW system before Friday. Can someone call me?"],
    ["Ahmed", "Ali", "+923001110002", "Karachi", 52000, "whatsapp", "Salam, net metering ke sath 15kW system ka kitna kharcha hoga?"],
    ["Fatima", "Noor", "+923001110003", "Islamabad", 21000, "manual", "Referred by a neighbour, interested in batteries."],
    ["Zain", "Hassan", "+971501110004", "Dubai", 0, "web_form", "Warehouse roof, 2,000 m². Looking for commercial proposal."],
    ["Maryam", "Iqbal", "+923001110005", "Lahore", 64000, "whatsapp", "Our bill is 64k a month. Is solar worth it?"],
    ["Usman", "Tariq", "+923001110006", "Karachi", 30000, "web_form", "Just browsing prices for now."],
    ["Hamza", "Javed", "+923001110007", "Lahore", 45000, "manual", "Wants a site survey next week."],
    ["Ayesha", "Siddiqui", "+923001110008", "Islamabad", 27000, "web_form", "Do you offer financing?"],
  ] as const;
  const contacts = [];
  for (const [first, last, phone, city, bill, , ] of people)
    contacts.push((await db.insert(schema.contacts).values({ workspaceId: ws.id, firstName: first, lastName: last, phone, custom: { city, ...(bill ? { monthly_bill: bill } : {}), owns_property: true }, tags: bill > 50000 ? ["high-bill"] : [] }).returning())[0]);

  const opp = async (ci: number, title: string, stage: string, kw: number | null, value: number, extra: Record<string, unknown> = {}, ownerId = ayesha.id) =>
    db.insert(schema.opportunities).values({ workspaceId: ws.id, pipelineId: pipe.id, stageId: st(stage).id, contactId: contacts[ci].id, ownerId, title, valueCents: value * 100, currency: "USD",
      custom: { ...(kw ? { system_kw: kw } : {}), ...extra }, closedAt: stage === "Won" || stage === "Lost" ? new Date() : null }).returning();
  await opp(0, "10kW rooftop — Khan residence", "New", 10, 7800);
  await opp(1, "15kW net-metered system", "Site survey", 15, 11400, { roof_type: "Flat" }, bilal.id);
  await opp(2, "Hybrid 6kW + batteries", "Proposal", 6, 9200, { roof_type: "Pitched", survey_date: "2026-10-12" });
  await opp(4, "20kW villa system", "Proposal", 20, 15600, { roof_type: "Flat", survey_date: "2026-10-09" }, bilal.id);
  await opp(6, "8kW rooftop", "Won", 8, 6100, { roof_type: "Metal", survey_date: "2026-10-01" });
  await opp(5, "5kW starter", "Lost", 5, 3900);
  await db.insert(schema.opportunities).values({ workspaceId: ws.id, pipelineId: comm.id, stageId: commStages[1].id, contactId: contacts[3].id, ownerId: bilal.id, title: "Warehouse 250kW", valueCents: 18_500_000, currency: "USD", custom: { annual_kwh: 410000 } });

  // Leads: some acknowledged, some live timers, one waiting in recovery.
  for (const [i, p] of people.entries()) {
    const lead = await createLead({ workspaceId: ws.id, contactId: contacts[i].id, source: p[5] as never, message: p[6] });
    if (i % 3 === 0 && lead.ownerId) await acknowledge(ws.id, lead.id, lead.ownerId);
  }
  await addActivity({ workspaceId: ws.id, contactId: contacts[1].id, actorId: bilal.id, type: "note", summary: "Called — prefers Urdu. Wants net metering paperwork explained." });
  // A completed WhatsApp thread for the inbox.
  const [conv] = await db.insert(schema.conversations).values({ workspaceId: ws.id, contactId: contacts[1].id, lastMessageAt: new Date() }).returning();
  await db.insert(schema.messages).values([
    { workspaceId: ws.id, conversationId: conv.id, direction: "inbound", body: people[1][6], status: "received", providerSid: `SMseed${stamp}1`, createdAt: new Date(Date.now() - 3600_000) },
    { workspaceId: ws.id, conversationId: conv.id, direction: "outbound", body: "Walaikum salam Ahmed! 15kW with net metering is usually 3.1–3.4M PKR. Can I book a free site survey this week?", status: "read", senderId: bilal.id, providerSid: `SMseed${stamp}2`, createdAt: new Date(Date.now() - 3000_000) },
    { workspaceId: ws.id, conversationId: conv.id, direction: "inbound", body: "Thursday 4pm theek hai", status: "received", providerSid: `SMseed${stamp}3`, createdAt: new Date(Date.now() - 2900_000) },
  ]);
  await db.update(schema.users).set({ status: "available" }).where(eq(schema.users.id, admin.id));

  console.log(`\n✓ Seeded "Sunrise Solar"\n  Owner:   ${ownerEmail}\n  Admin:   ${admin.email}\n  Manager: ${manager.email}\n  Sales:   ${ayesha.email}, ${bilal.email}, ${omar.email} (on leave)\n  Password for all: ${password}\n`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

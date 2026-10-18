import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ws = () => uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

/* ---------- Enums ---------- */
export const levelEnum = pgEnum("level", ["owner", "admin", "user"]);
export const availabilityEnum = pgEnum("availability", ["available", "busy", "on_leave", "offline"]);
export const fieldEntityEnum = pgEnum("field_entity", ["contact", "company", "opportunity"]);
export const fieldTypeEnum = pgEnum("field_type", ["text", "number", "date", "dropdown", "checkbox"]);
export const stageKindEnum = pgEnum("stage_kind", ["open", "won", "lost"]);
export const leadSourceEnum = pgEnum("lead_source", ["web_form", "whatsapp", "sms", "manual"]);
export const leadStatusEnum = pgEnum("lead_status", ["unassigned", "assigned", "acknowledged", "closed"]);
export const assignmentKindEnum = pgEnum("assignment_kind", ["initial", "escalation", "manual", "absence", "recovery"]);
export const msgDirectionEnum = pgEnum("msg_direction", ["inbound", "outbound"]);
export const msgStatusEnum = pgEnum("msg_status", ["received", "queued", "sending", "sent", "delivered", "read", "failed", "undelivered"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "expired", "failed", "canceled", "refunded", "partially_refunded"]);
export const apptStatusEnum = pgEnum("appt_status", ["scheduled", "cancelled"]);
export const providerEnum = pgEnum("provider", ["twilio", "stripe", "google", "telegram", "email"]);
export const integrationStatusEnum = pgEnum("integration_status", ["not_connected", "connected", "error"]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed"]);

/* ---------- Tenancy & identity (F1) ---------- */
export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: created(),
});

/** Configurable roles: a bag of permissions. "Manager" is just a row here (F1.3). */
export const roles = pgTable("roles", {
  id: id(),
  workspaceId: ws(),
  name: text("name").notNull(),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  createdAt: created(),
}, (t) => [uniqueIndex("roles_ws_name").on(t.workspaceId, t.name)]);

export const users = pgTable("users", {
  id: id(),
  workspaceId: ws(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  level: levelEnum("level").notNull().default("user"),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  status: availabilityEnum("status").notNull().default("offline"),
  timezone: text("timezone").notNull().default("UTC"),
  telegramChatId: text("telegram_chat_id"),
  lastAssignedAt: ts("last_assigned_at"),
  dashboardPrefs: jsonb("dashboard_prefs").$type<Record<string, boolean>>().notNull().default({}),
  deactivatedAt: ts("deactivated_at"),
  createdAt: created(),
}, (t) => [index("users_ws").on(t.workspaceId)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token; raw token never stored
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: created(),
});

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(), // "email:x" or "ip:y"
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull().defaultNow(),
  lockedUntil: ts("locked_until"),
});

export const invites = pgTable("invites", {
  id: id(),
  workspaceId: ws(),
  email: text("email").notNull(),
  level: levelEnum("level").notNull().default("user"),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  createdAt: created(),
});

/* ---------- CRM (F2) ---------- */
export const companies = pgTable("companies", {
  id: id(),
  workspaceId: ws(),
  name: text("name").notNull(),
  domain: text("domain"),
  custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("companies_ws").on(t.workspaceId)]);

export const contacts = pgTable("contacts", {
  id: id(),
  workspaceId: ws(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"), // E.164
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  optedOut: boolean("opted_out").notNull().default(false),
  optedOutAt: ts("opted_out_at"),
  custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  index("contacts_ws").on(t.workspaceId),
  uniqueIndex("contacts_ws_phone").on(t.workspaceId, t.phone),
]);

export const pipelines = pgTable("pipelines", {
  id: id(),
  workspaceId: ws(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: created(),
});

export const stages = pgTable("stages", {
  id: id(),
  workspaceId: ws(),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  kind: stageKindEnum("kind").notNull().default("open"),
  createdAt: created(),
}, (t) => [index("stages_pipeline").on(t.pipelineId)]);

/** pipelineId null = shared by all pipelines; set = only that pipeline (F2.3). */
export const customFields = pgTable("custom_fields", {
  id: id(),
  workspaceId: ws(),
  entity: fieldEntityEnum("entity").notNull(),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: fieldTypeEnum("type").notNull(),
  options: text("options").array().notNull().default(sql`'{}'::text[]`),
  position: integer("position").notNull().default(0),
  createdAt: created(),
}, (t) => [uniqueIndex("fields_ws_entity_key").on(t.workspaceId, t.entity, t.key)]);

/** Fields required before an opportunity may enter a stage (F2.4). */
export const stageRequiredFields = pgTable("stage_required_fields", {
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id").notNull().references(() => customFields.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.stageId, t.fieldId] })]);

export const opportunities = pgTable("opportunities", {
  id: id(),
  workspaceId: ws(),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "restrict" }),
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "restrict" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  valueCents: bigint("value_cents", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  closedAt: ts("closed_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("opps_ws_stage").on(t.workspaceId, t.stageId), index("opps_contact").on(t.contactId)]);

export const savedLists = pgTable("saved_lists", {
  id: id(),
  workspaceId: ws(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  entity: text("entity").notNull(), // "contacts" | "opportunities"
  filters: jsonb("filters").$type<unknown[]>().notNull().default([]),
  createdAt: created(),
});

/** Timeline entries for contacts / opportunities / leads (F2.7). */
export const activities = pgTable("activities", {
  id: id(),
  workspaceId: ws(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  leadId: uuid("lead_id"),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull(), // note | stage_change | assignment | field_edit | message | payment | appointment | ...
  summary: text("summary").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
}, (t) => [index("act_contact").on(t.contactId, t.createdAt), index("act_opp").on(t.opportunityId, t.createdAt)]);

/* ---------- Leads (F3) ---------- */
export const leadSettings = pgTable("lead_settings", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  maxOpenLeads: integer("max_open_leads").notNull().default(10),
  ackWindowSeconds: integer("ack_window_seconds").notNull().default(300),
  /** Ordered chain: [{ type: "next_eligible" | "backup" | "manager", seconds, userId? }] */
  escalationChain: jsonb("escalation_chain").$type<EscalationStep[]>().notNull().default([]),
  idleSeconds: integer("idle_seconds").notNull().default(86400),
  /** What happens to acknowledged leads when the owner goes on leave/offline (F3.6). */
  acknowledgedOnAbsence: text("acknowledged_on_absence").notNull().default("keep"), // keep | reassign
  /** Send an automated, clearly-labelled WhatsApp acknowledgement when a lead first escalates. */
  aiFirstResponse: boolean("ai_first_response").notNull().default(true),
  webFormKey: text("web_form_key").notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
  updatedAt: updated(),
});
export type EscalationStep = { type: "next_eligible" | "backup" | "manager"; seconds: number; userId?: string };

export const leads = pgTable("leads", {
  id: id(),
  workspaceId: ws(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  source: leadSourceEnum("source").notNull(),
  message: text("message"),
  status: leadStatusEnum("status").notNull().default("unassigned"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }), // single owner: one column (F3.8)
  assignedAt: ts("assigned_at"),
  ackDeadline: ts("ack_deadline"),
  firstAssignedAt: ts("first_assigned_at"),
  acknowledgedAt: ts("acknowledged_at"),
  firstAcknowledgedAt: ts("first_acknowledged_at"),
  escalationLevel: integer("escalation_level").notNull().default(0),
  escalationCount: integer("escalation_count").notNull().default(0),
  /** Set when the escalation chain ran out; the timer stops and the recovery queue owns it. */
  exhaustedAt: ts("exhausted_at"),
  lastActionAt: ts("last_action_at"),
  /** AI triage result: { intent, urgency, language, summary, tags } */
  ai: jsonb("ai").$type<{ intent: string; urgency: number; language: string; summary: string; tags: string[] }>(),
  version: integer("version").notNull().default(1),
  createdAt: created(),
}, (t) => [
  index("leads_ws_status").on(t.workspaceId, t.status),
  index("leads_deadline").on(t.ackDeadline).where(sql`status = 'assigned'`),
  index("leads_owner").on(t.ownerId),
]);

export const leadAssignments = pgTable("lead_assignments", {
  id: id(),
  workspaceId: ws(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: assignmentKindEnum("kind").notNull(),
  level: integer("level").notNull().default(0),
  reason: text("reason").notNull(),
  assignedAt: created(),
  endedAt: ts("ended_at"),
});

/* ---------- Messaging (I1) ---------- */
export const conversations = pgTable("conversations", {
  id: id(),
  workspaceId: ws(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  channel: text("channel").notNull().default("whatsapp"),
  lastMessageAt: ts("last_message_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("conv_ws_contact_channel").on(t.workspaceId, t.contactId, t.channel)]);

export const messages = pgTable("messages", {
  id: id(),
  workspaceId: ws(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  direction: msgDirectionEnum("direction").notNull(),
  body: text("body").notNull(),
  providerSid: text("provider_sid"),
  status: msgStatusEnum("status").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("msg_ws_sid").on(t.workspaceId, t.providerSid), // dedupe redelivered webhooks (I1.8)
  index("msg_conv").on(t.conversationId, t.createdAt),
]);

/* ---------- Payments (I2) ---------- */
export const payments = pgTable("payments", {
  id: id(),
  workspaceId: ws(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "restrict" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  refundedCents: bigint("refunded_cents", { mode: "number" }).notNull().default(0),
  checkoutSessionId: text("checkout_session_id").unique(),
  paymentIntentId: text("payment_intent_id"),
  url: text("url"),
  paidAt: ts("paid_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("pay_ws").on(t.workspaceId, t.status)]);

/* ---------- Calendar (I3) ---------- */
export const calendarConnections = pgTable("calendar_connections", {
  id: id(),
  workspaceId: ws(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email"),
  tokensEnc: text("tokens_enc").notNull(), // AES-GCM encrypted JSON; server-only (I3.2)
  expiresAt: ts("expires_at"),
  status: text("status").notNull().default("connected"), // connected | needs_reconnect
  lastError: text("last_error"),
  createdAt: created(),
  updatedAt: updated(),
});

export const appointments = pgTable("appointments", {
  id: id(),
  workspaceId: ws(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  startsAt: ts("starts_at").notNull(), // stored UTC; timezone kept for display (I3.5)
  endsAt: ts("ends_at").notNull(),
  timezone: text("timezone").notNull(),
  googleEventId: text("google_event_id"),
  status: apptStatusEnum("status").notNull().default("scheduled"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("appt_ws_start").on(t.workspaceId, t.startsAt)]);

/* ---------- Integrations (I5) ---------- */
export const integrations = pgTable("integrations", {
  id: id(),
  workspaceId: ws(),
  provider: providerEnum("provider").notNull(),
  status: integrationStatusEnum("status").notNull().default("not_connected"),
  secretsEnc: text("secrets_enc"), // never leaves the server
  publicConfig: jsonb("public_config").$type<Record<string, string>>().notNull().default({}),
  lastSuccessAt: ts("last_success_at"),
  lastErrorAt: ts("last_error_at"),
  lastError: text("last_error"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updated(),
}, (t) => [uniqueIndex("integ_ws_provider").on(t.workspaceId, t.provider)]);

export const integrationEvents = pgTable("integration_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull(),
  direction: msgDirectionEnum("direction").notNull(),
  kind: text("kind").notNull(),
  reference: text("reference"),
  result: text("result").notNull(), // success | failure | rejected | duplicate | retrying
  error: text("error"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
}, (t) => [index("ievt_ws").on(t.workspaceId, t.createdAt)]);

/** Idempotency ledger for inbound webhooks (I1.8, I2.4). */
export const processedEvents = pgTable("processed_events", {
  provider: providerEnum("provider").notNull(),
  eventId: text("event_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.provider, t.eventId] })]);

/** Durable outbox: retries survive restarts (I4.4, I5.5, Q5). */
export const jobs = pgTable("jobs", {
  id: id(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // send_message | notify_escalation | ...
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(4),
  runAt: ts("run_at").notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("jobs_due").on(t.runAt).where(sql`status = 'pending'`)]);

/* ---------- Audit (F4) — append-only, enforced by DB trigger ---------- */
export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id"), // null = system
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: created(),
}, (t) => [index("audit_ws_time").on(t.workspaceId, t.createdAt)]);

/* ---------- Email reports ---------- */
/** Daily progress report schedule: sent once per day at `hour` in `timezone` to `recipients`. */
export const reportSchedules = pgTable("report_schedules", {
  id: id(),
  workspaceId: ws(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  recipients: text("recipients").array().notNull(),
  hour: integer("hour").notNull().default(18),
  timezone: text("timezone").notNull().default("UTC"),
  enabled: boolean("enabled").notNull().default(true),
  lastSentAt: ts("last_sent_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("report_sched_ws").on(t.workspaceId)]);

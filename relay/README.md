# Relay — no lead left behind

A multi-tenant business platform for 5–30 person service companies. Every inbound lead gets **exactly one accountable owner**, a visible acknowledgement deadline and an automatic escalation path. WhatsApp, Stripe payments and Google Calendar bookings all land on the same customer record. Every important action is written to an append-only audit log.

Built by Team 65 for the *Unified Business Management Platform* challenge.

---

## Quick start

```bash
cd relay
pnpm install
cp .env.example .env            # then fill DATABASE_URL and ENCRYPTION_KEY (see below)
pnpm db:migrate                 # creates tables, the audit-log trigger and Supabase RLS lockdown
SEED_EMAIL=owner@sunrise.solar pnpm seed   # demo workspace "Sunrise Solar" (prints logins)
pnpm dev                        # http://localhost:3000 (web app + background worker in one process)
pnpm demo                       # production build + start — use this for the demo (pages load ~5x faster than dev)
```

Demo login: **owner@sunrise.solar / relay-demo-2026**. Other users are printed by the seed: an Admin, a Manager, and Sales staff (one of them on leave).

### Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres. Supabase **Session pooler** URL (port 5432). The worker and LISTEN/NOTIFY need a session connection. |
| `ENCRYPTION_KEY` | yes | 32 random bytes as base64. Encrypts integration secrets and OAuth tokens at rest. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `APP_URL` | yes | Public base URL. Webhooks are signed against it, so set it to your tunnel URL when testing providers. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for calendar | OAuth client of type *Web application*; redirect URI `APP_URL/api/integrations/google/callback`. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | for real email | Any free SMTP (Gmail app password: smtp.gmail.com:465; or Brevo). Without them, reports go to a free Ethereal test inbox and show a preview link. |
| `GROQ_API_KEY` / `GROQ_MODEL` | for AI | Free key from console.groq.com. Enables the Relay Assistant chatbot, lead triage, reply drafting, AI first response and the team briefing. Default model `openai/gpt-oss-120b`. Everything else works without it. |

Twilio, Stripe and Telegram credentials are **not** environment variables. Each workspace enters its own on **Settings → Integrations**, where they are verified against the provider, encrypted, and never sent back to the browser.

### Exposing webhooks locally

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
# put the https URL in APP_URL, restart `pnpm dev`, then copy the webhook URLs shown on Settings → Integrations
```

### Connecting the providers (sandbox / test mode)

1. **Twilio WhatsApp:** In the Twilio Console, open Messaging → Try it out → WhatsApp sandbox. From your phone, send the join phrase. In Relay, enter the Account SID, Auth token and `+14155238886`. Paste Relay's *When a message comes in* URL into the sandbox settings.
2. **Stripe:** In test mode, go to Developers → Webhooks and add an endpoint with Relay's URL and the listed events. Enter `sk_test_…` and the endpoint's `whsec_…` in Relay. Pay with card `4242 4242 4242 4242`. Refund from the Stripe dashboard to see the refund reflected in Relay.
3. **Google Calendar:** Create a Cloud project, enable the Calendar API, set up an OAuth consent screen (Testing, with yourself added as a test user) and a Web OAuth client. Each employee then clicks **Profile & alerts → Connect Google Calendar**.
4. **Telegram:** Create a bot with @BotFather and paste the token into Relay. Each employee clicks **Connect with @yourbot**. Over a non-HTTPS URL, enter the chat ID manually instead.

### Tests

```bash
pnpm test:leads      # 14 lead-engine checks against the real DB: concurrency, escalation chain, absence, capacity, audit immutability
pnpm test:e2e        # browser smoke test using installed Edge: signup, session persistence, lead capture, acknowledge, auth guards
pnpm typecheck
```

---

## Architecture

```
src/
  app/                  presentation: Next.js App Router pages, server actions (thin), API + webhook routes
  components/           UI (design tokens in app/globals.css; landing shader in components/landing)
  server/
    db/                 Drizzle schema + client (Postgres)
    domain/             business rules: leads engine, CRM, fields, messaging, payments, appointments, metrics, admin, AI features
    integrations/       provider adapters: twilio, google, telegram, shared store (secrets, sync log, idempotency)
    worker/             durable job runner + timer loop (started from instrumentation.ts)
    auth/  context.ts   sessions, rate limiting, per-request permission context
    audit.ts realtime.ts crypto.ts ai.ts
drizzle/                SQL migrations (incl. append-only audit trigger, RLS lockdown)
scripts/                seed, scenario tests, browser tests
```

- **Timers survive restarts.** Deadlines are stored on the lead rows. A worker ticks every second and claims expired leads with `SELECT … FOR UPDATE SKIP LOCKED`, then re-checks the condition under the lock. Two workers, or two timers firing together, can never escalate the same lead twice.
- **Outbox.** WhatsApp sends, Telegram alerts and AI jobs are rows in `jobs`. They retry with exponential back-off, survive restarts, and end as a visible failure with a plain-language reason.
- **Real time.** Any process can `NOTIFY`. The web server `LISTEN`s and fans events out over Server-Sent Events, scoped to the workspace. Open screens re-render on new leads, escalations, messages and payments.
- **Tenancy.** Every table carries `workspace_id`, and every query is scoped through the request context. Asking for another workspace's ID returns the same 404 as an ID that doesn't exist.

## Requirement map

| ID | Where |
|---|---|
| F1.1 sign-up, sessions | `app/(auth)/actions.ts`, `server/auth/session.ts` (HTTP-only cookie, hashed token in DB, 7-day expiry) |
| F1.2–F1.3 levels, configurable permissions | `server/permissions.ts`, `server/domain/admin.ts`, Settings → Roles (permission matrix) |
| F1.4 value masking | `maskValue` in `server/domain/crm.ts`: lists, detail, board, exports, activity data, dashboard |
| F1.5–F1.6, Q2 server enforcement and isolation | `ctx.require()` in every domain function; all queries filter by `workspaceId`; uniform 404s |
| F2.1–F2.8 CRM | `server/domain/crm.ts`, `fields.ts`; Contacts, Companies, Pipeline board, Settings → Pipelines & fields |
| F2.4 stage gates | `missingForStage` checked on create, edit and move; the board opens the missing fields and completes the move after save |
| F2.6 saved lists | filter specs are stored, not results, so lists re-evaluate on every read |
| F3.1–F3.9 lead protection | `server/domain/leads.ts` (assignment, acknowledgement, escalation, absence, recovery), `app/f/[key]` (web form), Twilio inbound, Telegram alerts |
| F4 audit | `server/audit.ts`; `drizzle/0001_audit_append_only.sql` blocks UPDATE, DELETE and TRUNCATE at the database level |
| F5 dashboard | `server/domain/metrics.ts` (definitions from the glossary), drill-down links use the same filters, per-user show/hide |
| I1 WhatsApp | `integrations/twilio.ts`, `domain/messaging.ts`, `api/webhooks/twilio/*`: signature check, dedup on MessageSid, status callbacks, retry, opt-out |
| I2 Stripe | `domain/payments.ts`, `api/webhooks/stripe`: raw-body signature, event-ID idempotency, forward-only status machine, refunds, collected vs projected |
| I3 Google | `integrations/google.ts`, `domain/appointments.ts`: OAuth with CSRF state, encrypted auto-refreshing tokens, free/busy conflicts, time-zone-safe instants |
| I4 Telegram | `integrations/telegram.ts`: per-user deep-link (HMAC-signed), webhook secret token, retries, failures visible to admins |
| I5 shared | Settings → Integrations (status, last success, recent errors, limits, webhook URLs), sync history, per-workspace encrypted credentials, audited changes |
| Q1 auth security | Argon2id, 5 failed attempts per 15 minutes per email and per IP, constant-time unknown-user path |
| Q3 input safety | Zod on every action, parameterised SQL, React escaping, CSV-injection guard, honeypot plus rate limit on the public form, Next server-action origin check, `SameSite=Lax` |
| Q4 integrity | optimistic `version` checks on contacts and opportunities; field deletion strips values; stage deletion moves deals; users are deactivated, never deleted |
| Q5 concurrency | advisory lock per workspace for round-robin; SKIP LOCKED claims; idempotency ledger for webhooks |
| Q7–Q8 responsive, a11y | mobile sheet navigation, labelled inputs, keyboard drag-and-drop (dnd-kit), status shown by shape plus label, reduced-motion support |
| Q11 real time | `server/realtime.ts` and `/api/events` (SSE) |

## Email reports

Settings → **Email reports** (or **Email report** on the dashboard): send a daily progress report now, or schedule it every day at a chosen hour and time zone. The report has the live dashboard figures, an AI-written summary and the leads at risk, scoped to the sender's permissions. The worker claims each day's send atomically, so a report goes out once even with several workers.

## AI features (beyond the brief)

All AI runs on **Groq's free tier** (`openai/gpt-oss-120b`, OpenAI-compatible API). It is optional, and an AI failure never blocks the core flows.

- **Relay Assistant** (Ctrl/⌘ K, or "Ask Relay" in the app). A tool-calling chatbot over live workspace data: daily summaries, "what needs attention", team status, pipeline and payment reports, escalations, and one-click customer summaries. Every tool calls the same permission-checked domain functions the UI uses, so value masking and record visibility apply. Tool output is passed to the model as data, never as instructions.
- **Lead triage:** on intake, the model scores urgency (0–100), states the intent and a one-line summary, and fills empty custom fields only with what the customer actually said.
- **AI first response:** on a lead's first escalation, if nobody has written yet, an automated and clearly labelled WhatsApp acknowledgement goes out. The human owner still owns the lead.
- **Reply copilot:** drafts the next WhatsApp message from the whole record. A human always presses send.
- **Team briefing:** a manager summary generated only from the live dashboard numbers.

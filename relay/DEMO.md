# Relay — demo checklist (honest status)

Run `pnpm demo` (production build). Log in as **owner@sunrise.solar / relay-demo-2026**; other seeded users and the password are printed by `pnpm seed`.

Automated proof, run it in front of the judges if useful:
- `pnpm tsx scripts/rubric-check.ts` — 29 checks for security, isolation, signed/forged/duplicate webhooks, refunds and failures, against the running app.
- `pnpm test:leads` — 14 lead-engine checks: concurrent expiry escalates once, chain, absence, capacity, audit immutability.
- `pnpm test:e2e` — browser test of signup, session persistence, lead capture and acknowledge.

Status key: ✅ verified working locally · 🔑 built, needs our account credentials to show live

| # | Criterion (points) | What to show | Status | Explain from |
|---|---|---|---|---|
| 1 | Roles, permissions, security (10) | Settings → Roles: untick *See opportunity values* for Sales, log in as a Sales user, values show as "Hidden" on the board, in exports and on the dashboard. A guessed contact id from another workspace returns 404. | ✅ | `server/context.ts`, `server/permissions.ts`, `maskValue` in `server/domain/crm.ts` |
| 2 | Customizable CRM (12) | Settings → Pipelines & fields: add a dropdown field, set a field as required for *Proposal*, then drag a deal into Proposal (blocked, the form opens). Commercial pipeline has its own fields. Contacts → combine 3 filters → *Save as list*. | ✅ | `server/domain/fields.ts`, `crm.ts`, `components/crm/board.tsx` |
| 3 | Lead assignment & escalation (14) | Settings → Assignment rules (seconds). New lead → countdown ring → let it expire → escalates once to the next person, then backup, then manager. Set someone *On leave* and their unacknowledged leads move at once. Recovery queue shows the reason. | ✅ | `server/domain/leads.ts` (row locks, `SKIP LOCKED`), `server/worker/` |
| 4 | Audit log & dashboard (8) | Audit log filters; entries can't be edited (DB trigger). Dashboard figures click through to the matching lists; a Sales user sees only their own numbers. | ✅ | `drizzle/0001_audit_append_only.sql`, `server/domain/metrics.ts` |
| 5 | Messaging (12) | A phone messages the **Telegram bot** (or WhatsApp) → contact + lead appear live; reply from the Inbox arrives on the phone; forged and duplicate webhooks handled; failed send shows the reason with *Retry*. | Webhooks via public tunnel ✅ (rubric-check, 29/29). Live phone → 🔑 bot token (1 min) | `server/integrations/twilio.ts`, `server/domain/messaging.ts` |
| 6 | Payments (12) | Opportunity → Request payment → pay with 4242 card → status flips to Paid with no refresh; refund in the Stripe dashboard → Refunded. | Signature, idempotency, refund and expiry ✅ through the tunnel. Live checkout → 🔑 `sk_test` key (webhook auto-created) | `server/domain/payments.ts`, `app/api/webhooks/stripe` |
| 7 | Calendar (10) | Profile → Connect Google Calendar; book from a contact; overlap warning; time shown in both zones; reschedule/cancel updates Google. | 🔑 Google OAuth client (code complete, not yet run against Google) | `server/integrations/google.ts`, `server/domain/appointments.ts` |
| 8 | Notifications (4) | Escalate a lead → Telegram message to the new owner with the lead, reason and a link (link works through the tunnel). | 🔑 same bot token as #5 | `server/integrations/telegram.ts` |
| 9 | Quality (10) | Phone layout (sidebar sheet, portrait fold); clear error toasts; no secrets in git (scanned); restart the server and timers resume; Twilio failing doesn't affect payments. | ✅ | `server/env.ts`, `server/worker/jobs.ts` |
| 10 | Demo & understanding (8) | This checklist. Each member owns rows above. | ✅ | README → *Architecture* |

## Before the demo (free, about 8 minutes in total)
1. **Tunnel (no account):** `pnpm tunnel` → `https://relay-team65-demo.loca.lt`, already set as `APP_URL`. Webhooks re-register automatically on every start.
2. **Telegram bot (1 min) — covers Messaging *and* Notifications:** in Telegram open @BotFather → `/newbot` → copy the token → Relay → Settings → Integrations → Telegram → paste. Customers just message the bot, with no sandbox join. Each staff member: Profile → *Connect with @bot*.
3. **Stripe (2 min):** sign up at stripe.com (test mode, no business details) → Developers → API keys → copy `sk_test_…` → Integrations → Stripe → paste. Relay creates the webhook endpoint itself.
4. **Google Calendar (5 min):** console.cloud.google.com → new project → enable *Google Calendar API* → OAuth consent screen (External, Testing, add your Gmail as a test user) → Credentials → OAuth client ID (Web) with redirect URI `http://localhost:3000/api/integrations/google/callback` → put the ID and secret in `.env` → restart → Profile → *Connect Google Calendar*.
5. Optional: Twilio WhatsApp still works if you add a sandbox. Telegram already satisfies the messaging criterion.

## Extras beyond the rubric
Relay Assistant (Groq) chatbot · AI lead triage and first response · daily email reports (now or scheduled) · foldable-device landing page with light and dark themes.

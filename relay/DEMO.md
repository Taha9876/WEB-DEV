# Relay — demo checklist (honest status)

Run `pnpm demo` (production build). Log in as **owner@sunrise.solar / relay-demo-2026**; other seeded users and the password are printed by `pnpm seed`.

Automated proof, run it in front of the judges if useful:
- `pnpm tsx scripts/rubric-check.ts` — 25 checks for security, isolation, signed/forged/duplicate webhooks, refunds and failures, against the running app.
- `pnpm test:leads` — 14 lead-engine checks: concurrent expiry escalates once, chain, absence, capacity, audit immutability.
- `pnpm test:e2e` — browser test of signup, session persistence, lead capture and acknowledge.

Status key: ✅ verified working locally · 🔑 built, needs our account credentials to show live

| # | Criterion (points) | What to show | Status | Explain from |
|---|---|---|---|---|
| 1 | Roles, permissions, security (10) | Settings → Roles: untick *See opportunity values* for Sales, log in as a Sales user, values show as "Hidden" on the board, in exports and on the dashboard. A guessed contact id from another workspace returns 404. | ✅ | `server/context.ts`, `server/permissions.ts`, `maskValue` in `server/domain/crm.ts` |
| 2 | Customizable CRM (12) | Settings → Pipelines & fields: add a dropdown field, set a field as required for *Proposal*, then drag a deal into Proposal (blocked, the form opens). Commercial pipeline has its own fields. Contacts → combine 3 filters → *Save as list*. | ✅ | `server/domain/fields.ts`, `crm.ts`, `components/crm/board.tsx` |
| 3 | Lead assignment & escalation (14) | Settings → Assignment rules (seconds). New lead → countdown ring → let it expire → escalates once to the next person, then backup, then manager. Set someone *On leave* and their unacknowledged leads move at once. Recovery queue shows the reason. | ✅ | `server/domain/leads.ts` (row locks, `SKIP LOCKED`), `server/worker/` |
| 4 | Audit log & dashboard (8) | Audit log filters; entries can't be edited (DB trigger). Dashboard figures click through to the matching lists; a Sales user sees only their own numbers. | ✅ | `drizzle/0001_audit_append_only.sql`, `server/domain/metrics.ts` |
| 5 | Messaging (12) | Phone sends WhatsApp → contact + lead appear live; reply from Inbox; delivery ticks; a forged webhook is rejected (sync history); failed send shows the reason with *Retry*. | Webhook security, duplicates, failure and retry ✅ (rubric-check). Live phone → 🔑 Twilio sandbox + public URL | `server/integrations/twilio.ts`, `server/domain/messaging.ts` |
| 6 | Payments (12) | Opportunity → Request payment → pay with 4242 card → status flips to Paid with no refresh; refund in the Stripe dashboard → Refunded. | Verified signature, idempotency, refund and expiry ✅ (rubric-check). Live checkout → 🔑 Stripe test keys + public URL | `server/domain/payments.ts`, `app/api/webhooks/stripe` |
| 7 | Calendar (10) | Profile → Connect Google Calendar; book from a contact; overlap warning; time shown in both zones; reschedule/cancel updates Google. | 🔑 Google OAuth client (code complete, not yet run against Google) | `server/integrations/google.ts`, `server/domain/appointments.ts` |
| 8 | Notifications (4) | Escalate a lead → Telegram message with the lead, reason and a link. | 🔑 Telegram bot token (code complete) | `server/integrations/telegram.ts` |
| 9 | Quality (10) | Phone layout (sidebar sheet, portrait fold); clear error toasts; no secrets in git (scanned); restart the server and timers resume; Twilio failing doesn't affect payments. | ✅ | `server/env.ts`, `server/worker/jobs.ts` |
| 10 | Demo & understanding (8) | This checklist. Each member owns rows above. | ✅ | README → *Architecture* |

## Before the demo (to turn every 🔑 green)
1. `cloudflared tunnel --url http://localhost:3000`, then put the https URL in `APP_URL` and run `pnpm demo` again.
2. Twilio: join the WhatsApp sandbox from the demo phone; enter the SID and token on Settings → Integrations; paste the inbound URL into Twilio.
3. Stripe: test keys plus a webhook endpoint with the listed events.
4. Google: OAuth client in `.env`, with the demo account added as a test user.
5. Telegram: bot token on Integrations; each demo user clicks *Connect with @bot*.

## Extras beyond the rubric
Relay Assistant (Groq) chatbot · AI lead triage and first response · daily email reports (now or scheduled) · foldable-device landing page with light and dark themes.

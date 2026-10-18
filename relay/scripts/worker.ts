/* Standalone background worker: escalation timers, message/alert/report jobs, scheduled reports.
   Use when the web app runs on serverless hosting (Vercel), where background loops don't stay alive.
   It talks only to the database (+ providers), so run it anywhere:  pnpm worker   (reads .env) */
import "dotenv/config";

async function main() {
  const { startWorker } = await import("../src/server/worker");
  await import("../src/server/integrations/register"); // job handlers: messages, AI, Telegram alerts, reports
  startWorker();
  console.log("[worker] standalone worker running — Ctrl+C to stop");
}
main().catch((e) => { console.error(e); process.exit(1); });

import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness for the status badge: database reachable and the worker queue not backed up. */
export async function GET() {
  try {
    const [r] = await sql<{ stuck: number }[]>`select count(*)::int as stuck from jobs where status = 'pending' and run_at < now() - interval '5 minutes'`;
    // Which optional features are configured on this deployment (booleans only — never values).
    const config = {
      appUrl: process.env.APP_URL ?? null,
      smtp: !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
      google: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      groq: !!process.env.GROQ_API_KEY,
      env: process.env.VERCEL_ENV ?? "local",
    };
    return Response.json({ ok: true, db: "up", backlog: r.stuck, config }, { status: r.stuck > 50 ? 503 : 200 });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}

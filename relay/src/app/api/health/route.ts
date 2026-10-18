import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness for the status badge: database reachable and the worker queue not backed up. */
export async function GET() {
  try {
    const [r] = await sql<{ stuck: number }[]>`select count(*)::int as stuck from jobs where status = 'pending' and run_at < now() - interval '5 minutes'`;
    return Response.json({ ok: true, db: "up", backlog: r.stuck }, { status: r.stuck > 50 ? 503 : 200 });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}

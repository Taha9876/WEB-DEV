import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "../db";

export type JobMeta = { attempt: number; maxAttempts: number; final: boolean };
type Handler = (payload: Record<string, unknown>, workspaceId: string | null, meta: JobMeta) => Promise<void>;
const handlers: Record<string, Handler> = {};
export const registerJob = (kind: string, h: Handler) => { handlers[kind] = h; };

/** Thrown by handlers for errors that retrying will not fix (bad credentials, opted-out, ...). */
export class PermanentError extends Error {}

const backoff = (attempt: number) => Math.min(60, 2 ** attempt * 2); // 4s, 8s, 16s, 32s...

/** Outbox runner: claim due jobs with SKIP LOCKED, retry transient failures with back-off (I5.5). */
export async function processJobs(limit = 10) {
  const claimed = await db.execute<{ id: string }>(sql`
    update jobs set status = 'running', attempts = attempts + 1, updated_at = now()
    where id in (select id from jobs where status = 'pending' and run_at <= now() order by run_at limit ${limit} for update skip locked)
    returning id`);
  for (const { id } of claimed) {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    const h = handlers[job.kind];
    try {
      if (!h) throw new PermanentError(`No handler for ${job.kind}`);
      await h(job.payload, job.workspaceId, { attempt: job.attempts, maxAttempts: job.maxAttempts, final: job.attempts >= job.maxAttempts });
      await db.update(schema.jobs).set({ status: "done", lastError: null, updatedAt: new Date() }).where(eq(schema.jobs.id, id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const final = e instanceof PermanentError || job.attempts >= job.maxAttempts;
      await db.update(schema.jobs).set({
        status: final ? "failed" : "pending", lastError: msg, updatedAt: new Date(),
        runAt: new Date(Date.now() + backoff(job.attempts) * 1000),
      }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "running")));
    }
  }
}

/** Jobs stuck in "running" (process died mid-job) go back to the queue. */
export async function reviveStuckJobs() {
  await db.update(schema.jobs).set({ status: "pending" })
    .where(and(eq(schema.jobs.status, "running"), lte(schema.jobs.updatedAt, new Date(Date.now() - 120_000))));
}

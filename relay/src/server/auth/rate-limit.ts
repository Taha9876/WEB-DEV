import { sql } from "../db";

const WINDOW_S = 15 * 60, MAX = 5, LOCK_S = 15 * 60;

/** Seconds remaining on the longest active lock among keys, else 0 (Q1). */
export async function lockedFor(keys: string[]): Promise<number> {
  const [r] = await sql<{ s: number }[]>`
    select coalesce(ceil(extract(epoch from max(locked_until) - now())), 0)::int as s
    from login_attempts where key = any(${keys}) and locked_until > now()`;
  return r?.s ?? 0;
}

export async function recordFailure(keys: string[]) {
  for (const key of keys) {
    const [r] = await sql<{ count: number }[]>`
      insert into login_attempts (key, count, window_start) values (${key}, 1, now())
      on conflict (key) do update set
        count = case when login_attempts.window_start < now() - make_interval(secs => ${WINDOW_S}) then 1 else login_attempts.count + 1 end,
        window_start = case when login_attempts.window_start < now() - make_interval(secs => ${WINDOW_S}) then now() else login_attempts.window_start end
      returning count`;
    if (r.count >= MAX) await sql`update login_attempts set locked_until = now() + make_interval(secs => ${LOCK_S}) where key = ${key}`;
  }
}

export const clearFailures = (keys: string[]) => sql`delete from login_attempts where key = any(${keys})`;

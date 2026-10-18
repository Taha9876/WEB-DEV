import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Queries go through Supabase's transaction pooler (port 6543), which scales to many clients; transaction-scoped
 * features we rely on (FOR UPDATE, advisory xact locks) work there. LISTEN needs a session, so realtime gets one
 * dedicated connection on the session pooler (5432). Plain Postgres URLs are used as-is for both.
 */
const sessionUrl = env.DATABASE_URL;
const txUrl = sessionUrl.includes("pooler.supabase.com:5432") ? sessionUrl.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543") : sessionUrl;

const g = globalThis as unknown as { __sql?: postgres.Sql; __listen?: postgres.Sql };
export const sql = g.__sql ?? postgres(txUrl, { max: 8, idle_timeout: 20, prepare: txUrl !== sessionUrl ? false : true });
if (env.NODE_ENV !== "production") g.__sql = sql;

/** Lazily opened single session connection, only for LISTEN. */
export const listenSql = () => (g.__listen ??= postgres(sessionUrl, { max: 1, idle_timeout: 0 }));

export const db = drizzle(sql, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };

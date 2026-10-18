import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

const g = globalThis as unknown as { __sql?: postgres.Sql };
export const sql = g.__sql ?? postgres(env.DATABASE_URL, { max: 10 });
if (env.NODE_ENV !== "production") g.__sql = sql;

export const db = drizzle(sql, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };

import { unstable_rethrow } from "next/navigation";
import { AppError } from "./errors";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; code?: string; details?: unknown };

/** Wraps a server action: domain errors become plain, user-facing messages (Q10). */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code, details: e.details };
    console.error(e);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}

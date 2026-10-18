import { assignWaiting, escalateDue } from "../domain/leads";
import { processJobs, reviveStuckJobs } from "./jobs";

const g = globalThis as unknown as { __worker?: boolean };

/** Durable-timer loop. All state lives in Postgres, so a restart resumes exactly where it left off (Q5). */
export function startWorker(intervalMs = 1000) {
  if (g.__worker) return;
  g.__worker = true;
  let busy = false, n = 0;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await escalateDue();
      await assignWaiting();
      await processJobs();
      if (++n % 30 === 0) await reviveStuckJobs();
    } catch (e) {
      console.error("[worker]", e);
    } finally {
      busy = false;
    }
  };
  setInterval(tick, intervalMs);
  console.log("[worker] started");
}

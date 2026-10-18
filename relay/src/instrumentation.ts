export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.RUN_WORKER !== "0") {
    const { startWorker } = await import("./server/worker");
    const { ensureListening } = await import("./server/realtime");
    await import("./server/integrations/register");
    ensureListening();
    startWorker();
    const { syncWebhooks } = await import("./server/integrations/sync");
    syncWebhooks().catch((e) => console.warn("[sync]", e));
  }
}

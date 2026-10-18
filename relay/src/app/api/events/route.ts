import { getCtx } from "@/server/context";
import { bus, ensureListening, type RealtimeEvent } from "@/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events: one stream per tab, scoped to the caller's workspace (Q11, F1.6). */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  ensureListening();

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: RealtimeEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 25_000);
      bus.on(ctx.workspaceId, send);
      controller.enqueue(enc.encode("retry: 3000\n\n"));
      cleanup = () => { clearInterval(ping); bus.off(ctx.workspaceId, send); };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

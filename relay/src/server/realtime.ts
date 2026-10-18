import { EventEmitter } from "node:events";
import { sql, listenSql } from "./db";

/** Cross-process fan-out: any process NOTIFYs, the web server LISTENs and pushes over SSE (Q11). */
export type RealtimeEvent =
  | { type: "lead.created" | "lead.assigned" | "lead.acknowledged" | "lead.escalated"; leadId: string; ownerId?: string | null }
  | { type: "message.new" | "message.status"; conversationId: string; messageId: string }
  | { type: "payment.updated"; paymentId: string; opportunityId: string }
  | { type: "appointment.updated"; appointmentId: string }
  | { type: "availability.changed"; userId: string }
  | { type: "integration.updated"; provider: string };

const CHANNEL = "relay_events";

export async function publish(workspaceId: string, event: RealtimeEvent) {
  try { await sql.notify(CHANNEL, JSON.stringify({ workspaceId, event })); } catch { /* best-effort */ }
}

const g = globalThis as unknown as { __bus?: EventEmitter; __listening?: boolean };
export const bus = (g.__bus ??= new EventEmitter().setMaxListeners(0));

export function ensureListening() {
  if (g.__listening) return;
  g.__listening = true;
  listenSql().listen(CHANNEL, (payload) => {
    try {
      const { workspaceId, event } = JSON.parse(payload);
      bus.emit(workspaceId, event);
    } catch { /* ignore malformed */ }
  }).catch(() => { g.__listening = false; });
}

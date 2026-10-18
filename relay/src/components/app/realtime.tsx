"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Event = { type: string; leadId?: string; ownerId?: string | null; [k: string]: unknown };
type Listener = (e: Event) => void;
const Ctx = createContext<{ subscribe: (l: Listener) => () => void } | null>(null);

/** One EventSource per tab. Any event re-renders server components (debounced), so every view stays live. */
export function RealtimeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  const listeners = useRef(new Set<Listener>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as Event;
      listeners.current.forEach((l) => l(e));
      if (e.ownerId === userId && (e.type === "lead.created" || e.type === "lead.assigned"))
        toast("New lead assigned to you", { description: "Acknowledge it before the timer runs out.", action: { label: "Open", onClick: () => router.push(`/leads/${e.leadId}`) } });
      if (e.ownerId === userId && e.type === "lead.escalated")
        toast.warning("A lead was escalated to you", { action: { label: "Open", onClick: () => router.push(`/leads/${e.leadId}`) } });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    return () => { es.close(); clearTimeout(timer.current); };
  }, [router, userId]);

  return (
    <Ctx.Provider value={{ subscribe: (l) => { listeners.current.add(l); return () => listeners.current.delete(l); } }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRealtime(l: Listener) {
  const c = useContext(Ctx);
  useEffect(() => c?.subscribe(l), [c, l]);
}

"use client";

import { useRouter } from "next/navigation";

export function AuditFilters({ actions, team, value }: { actions: string[]; team: { id: string; name: string }[]; value: Record<string, string | undefined> }) {
  const router = useRouter();
  const go = (k: string, v: string) => router.push(`/audit?${new URLSearchParams(Object.fromEntries(Object.entries({ ...value, [k]: v, p: "" }).filter(([, x]) => x)) as Record<string, string>)}`);
  const cls = "h-9 rounded-lg border border-input bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-hairline bg-surface/40 px-4 py-4 sm:px-8">
      <label className="text-xs">Event<select value={value.action ?? ""} onChange={(e) => go("action", e.target.value)} className={`${cls} mt-1 block`}>
        <option value="">All events</option>{[...new Set(actions)].map((a) => <option key={a} value={a}>{a.includes(".") ? a : `${a}.*`}</option>)}</select></label>
      <label className="text-xs">Who<select value={value.actor ?? ""} onChange={(e) => go("actor", e.target.value)} className={`${cls} mt-1 block`}>
        <option value="">Everyone</option><option value="system">System</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="text-xs">From<input type="date" value={value.from ?? ""} onChange={(e) => go("from", e.target.value)} className={`${cls} mt-1 block`} /></label>
      <label className="text-xs">To<input type="date" value={value.to ?? ""} onChange={(e) => go("to", e.target.value)} className={`${cls} mt-1 block`} /></label>
    </div>
  );
}

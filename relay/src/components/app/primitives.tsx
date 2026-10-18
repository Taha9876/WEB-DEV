"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Globe, MessageCircle, MessageSquare, PenLine } from "lucide-react";

export function PageHeader({ title, description, children }: { title: React.ReactNode; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-hairline px-4 pb-6 pt-8 sm:flex-row sm:items-end sm:justify-between sm:px-8">
      <div>
        <h1 className="font-display text-4xl leading-none tracking-tight md:text-5xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const SOURCES = {
  web_form: { label: "Web form", icon: Globe },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  sms: { label: "SMS", icon: MessageSquare },
  manual: { label: "Manual", icon: PenLine },
} as const;

export function SourceBadge({ source }: { source: keyof typeof SOURCES }) {
  const s = SOURCES[source];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground">
      <s.icon className="size-3" aria-hidden /> {s.label}
    </span>
  );
}

/** Clock-skew-safe countdown: server sends its "now", we track the offset. */
export function useServerClock(serverNow: number) {
  const [offset] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m}:${String(r).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function CountdownRing({ deadline, start, now, size = 44 }: { deadline: number; start: number; now: number; size?: number }) {
  const total = Math.max(1, deadline - start), left = deadline - now;
  const pct = Math.max(0, Math.min(1, left / total));
  const r = size / 2 - 3, C = 2 * Math.PI * r;
  const tone = left <= 0 ? "var(--destructive)" : pct < 0.25 ? "var(--ember)" : "var(--signal)";
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="timer"
      aria-label={left > 0 ? `${fmtDuration(left)} left to acknowledge` : "Acknowledgement window expired"}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="2.5" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - pct), stroke: tone }} transition={{ duration: 0.25, ease: "linear" }} />
      </svg>
      <span className="font-mono text-[10px] tabular" style={{ color: left <= 0 ? "var(--destructive)" : undefined }}>
        {left > 0 ? fmtDuration(left) : "late"}
      </span>
    </div>
  );
}

export function EmptyState({ icon: I, title, body, children }: { icon: React.ElementType; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-hairline bg-surface"><I className="size-6 text-muted-foreground" /></div>
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

export function initials(name?: string | null) {
  return (name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function Avatar({ name, className = "size-7 text-[10px]" }: { name?: string | null; className?: string }) {
  // Deterministic hue per person — recognisable at a glance.
  const hue = [...(name ?? "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-medium ${className}`} title={name ?? undefined}
      style={{ background: `oklch(0.35 0.08 ${hue})`, color: `oklch(0.92 0.06 ${hue})` }}>
      {initials(name)}
    </span>
  );
}

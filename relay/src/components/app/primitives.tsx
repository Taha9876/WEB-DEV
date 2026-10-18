"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

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

export { PageHeader, SourceBadge, EmptyState, Avatar, initials } from "./static";

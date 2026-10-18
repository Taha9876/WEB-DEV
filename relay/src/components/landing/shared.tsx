"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useInView } from "motion/react";

/* Shared landing primitives: imported by both landing.tsx and landing-sections.tsx (no import cycle). */
export const EASE = [0.16, 1, 0.3, 1] as const;

export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 2l2.6 10.2L29 16l-10.4 3.8L16 30l-2.6-10.2L3 16l10.4-3.8z" fill="var(--signal)" />
      <circle cx="16" cy="16" r="2.4" fill="var(--background)" />
    </svg>
  );
}

/* ---------------------------------------------------------------- split-word headline reveal */
export function Words({ text, accent, delay = 0 }: { text: string; accent?: string; delay?: number }) {
  const words = text ? text.split(" ") : [];
  const acc = accent ? accent.split(" ") : [];
  const all = [...words, ...acc];
  return (
    <span aria-label={[text, accent].filter(Boolean).join(" ")}>
      {all.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.1em] align-bottom">
          <motion.span className={`inline-block ${i >= words.length ? "text-accent-text" : ""}`} initial={{ y: "105%", opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.06 }}>{w}{i < all.length - 1 ? " " : ""}</motion.span>
        </span>
      ))}
    </span>
  );
}

export function CountUp({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const c = animate(0, to, { duration: 1.8, ease: EASE, onUpdate: (v) => (el.textContent = v.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix) });
    return () => c.stop();
  }, [inView, to, suffix, decimals]);
  return <span ref={ref}>{(0).toFixed(decimals)}{suffix}</span>;
}

/* ---------------------------------------------------------------- section heading with word reveal on view */
export function SectionHead({ eyebrow, title, accent, body }: { eyebrow: string; title: string; accent?: string; body?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  return (
    <div ref={ref} className="max-w-3xl">
      <motion.p initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-accent-text"><Logo className="size-3.5" />{eyebrow}</motion.p>
      <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[1.02]">
        {inView ? <Words text={title} accent={accent} /> : <span className="opacity-0">{title} {accent}</span>}
      </h2>
      {body && <motion.p initial={{ opacity: 0, y: 8 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.4, duration: 0.8 }} className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">{body}</motion.p>}
    </div>
  );
}


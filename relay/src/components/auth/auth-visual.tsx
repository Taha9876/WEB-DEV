"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";

const HeroCanvas = dynamic(() => import("@/components/landing/hero-canvas"), { ssr: false });

export function AuthVisual() {
  return (
    <aside className="grain relative hidden overflow-hidden border-l border-hairline bg-surface lg:block" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,oklch(0.91_0.2_125/0.12),transparent_60%)]" />
      <div className="absolute inset-0 translate-x-[8%]"><HeroCanvas /></div>
      <motion.blockquote initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-x-10 bottom-10 z-10 max-w-md">
        <p className="font-display text-4xl leading-[1.05]">Every lead gets an owner, a deadline, and a <em className="italic text-signal">reply.</em></p>
        <p className="mt-4 text-sm text-muted-foreground">Round-robin assignment · live acknowledgement timers · automatic escalation</p>
      </motion.blockquote>
    </aside>
  );
}

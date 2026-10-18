"use client";

import { motion, useMotionValue } from "motion/react";
import { FoldDevice } from "@/components/landing/fold-device";
import { CoverIncoming } from "@/components/landing/device-screens";

/** Auth side panel: the closed device with an incoming lead, floating in the cursor light. */
export function AuthVisual() {
  const k = useMotionValue(1), inner = useMotionValue(0);
  return (
    <aside className="relative hidden overflow-hidden border-l border-hairline lg:block" aria-hidden>
      <div className="relative flex h-full flex-col items-center justify-center gap-10 p-10">
        <motion.div initial={{ opacity: 0, y: 40, rotate: -4 }} animate={{ opacity: 1, y: [0, -10, 0], rotate: -4 }}
          transition={{ opacity: { duration: 1 }, y: { duration: 6, repeat: Infinity, ease: "easeInOut" } }} className="translate-x-[8%]">
          <FoldDevice k={k} inner={inner} o="landscape" scale={0.62} screen={null} cover={<CoverIncoming />} statusBar={false} />
        </motion.div>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md text-center font-display text-4xl leading-[1.05]">Every lead gets an owner, a deadline, and <em>a reply.</em></motion.p>
      </div>
    </aside>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";

type Mode = "light" | "dark";
const KEY = "relay-theme";
const Ctx = createContext<{ theme: Mode; toggle: (e?: React.MouseEvent) => void }>({ theme: "dark", toggle: () => {} });

/** Runs before paint (inlined in <head>) so the first frame already has the right theme — no flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(!t)t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var d=document.documentElement;d.classList.toggle("dark",t==="dark");d.style.colorScheme=t;}catch(e){}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Mode>("dark");
  useEffect(() => { setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"); }, []);

  const apply = (t: Mode) => {
    const d = document.documentElement;
    d.classList.toggle("dark", t === "dark");
    d.style.colorScheme = t;
    try { localStorage.setItem(KEY, t); } catch {}
    setTheme(t);
  };

  /** Circular reveal from the click point via the View Transitions API, when the browser has it. */
  const toggle = useCallback((e?: React.MouseEvent) => {
    const next: Mode = theme === "dark" ? "light" : "dark";
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply(next);
    const x = e?.clientX ?? innerWidth - 40, y = e?.clientY ?? 40;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(() => apply(next)).ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 700, easing: "cubic-bezier(0.16,1,0.3,1)", pseudoElement: "::view-transition-new(root)" });
    });
  }, [theme]);

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`relative grid size-9 place-items-center overflow-hidden rounded-full border border-hairline bg-surface/60 backdrop-blur transition-colors hover:bg-accent ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ y: 14, rotate: -90, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: -14, rotate: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}>
          {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

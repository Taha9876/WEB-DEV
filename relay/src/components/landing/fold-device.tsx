"use client";

import { useEffect, useState } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { useTheme } from "@/components/theme";

/**
 * Foldable device, rebuilt from the Foldfolio brief: Duo-style opening, no camera, rounded hinge-side
 * corners when closed, a real crease, no squeezed leaf (true 3D rotation with a long perspective),
 * landscape book-fold on wide screens and portrait flip-fold on phones.
 * Everything is driven by MotionValues: no React re-render per frame.
 */

// Device geometry in design px. Screen = W − 2·(f + bz). Landscape screen 976×660, portrait 358×718.
export const GEO = {
  landscape: { W: 1000, H: 684, f: 4, bz: 8, R: 46 },
  portrait: { W: 380, H: 740, f: 4, bz: 7, R: 42 },
};
const FINISH = {
  light: ["#DCD9D3", "#A6A29B", "#F7F5F1", "#6F6B65"], // titanium: base, shade, highlight, deep
  dark: ["#3A3A3D", "#1B1B1D", "#6A6A6E", "#0E0E10"], // graphite
};
const PERSPECTIVE = 2800;

export type Orientation = "landscape" | "portrait";

export function useOrientation(): { o: Orientation; vw: number; vh: number } {
  const [s, set] = useState({ o: "landscape" as Orientation, vw: 1440, vh: 900 });
  useEffect(() => {
    let lastW = 0;
    const m = () => {
      const vw = innerWidth, vh = innerHeight;
      // ignore height-only jitter from mobile address bars
      if (vw === lastW && vw < 900 && Math.abs(vh - s.vh) < 110) return;
      lastW = vw;
      set({ o: vw < 760 || vw / vh < 0.85 ? "portrait" : "landscape", vw, vh });
    };
    m(); addEventListener("resize", m); return () => removeEventListener("resize", m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return s;
}

const rad = (tl: number, tr: number, br: number, bl: number) => `${tl}px ${tr}px ${br}px ${bl}px`;

export function FoldDevice({ k, inner, o, scale, screen, cover, statusBar = true, onContentHeight }: {
  /** 1 = fully closed, 0 = fully open */
  k: MotionValue<number>;
  /** inner scroll of the screen content, in design px */
  inner: MotionValue<number>;
  o: Orientation;
  scale: number;
  screen: React.ReactNode;
  cover: React.ReactNode;
  statusBar?: boolean;
  /** reports the real height of the screen content so the caller can scroll exactly to its end */
  onContentHeight?: (h: number) => void;
}) {
  const { theme } = useTheme();
  const G = GEO[o];
  const P = o === "portrait";
  const F = FINISH[theme];
  const b = G.f + G.bz;
  const half = P ? { w: G.W, h: G.H / 2 } : { w: G.W / 2, h: G.H };
  const screenHalf = P ? { w: G.W - 2 * b, h: G.H / 2 - b } : { w: G.W / 2 - b, h: G.H - 2 * b };

  // Angle of the moving half: 0° open → 180° closed.
  const th = useTransform(k, (v) => 180 * v);
  const leafT = useTransform(th, (t) => (t < 0.2 ? "none" : `perspective(${PERSPECTIVE}px) ${P ? `rotateX(${-t}deg)` : `rotateY(${t}deg)`}`));
  const coverT = useTransform(th, (t) => (t > 179.8 ? "none" : `perspective(${PERSPECTIVE}px) ${P ? `rotateX(${180 - t}deg)` : `rotateY(${t - 180}deg)`}`));
  const leafVis = useTransform(th, (t) => (t < 90 ? "visible" : "hidden"));
  const coverVis = useTransform(th, (t) => (t >= 90 ? "visible" : "hidden"));
  const rightVis = useTransform(th, (t) => (t > 176 ? "hidden" : "visible"));
  // Shading: the turning leaf darkens toward edge-on; the static half catches its shadow.
  const shF = useTransform(th, (t) => (t < 90 ? Math.pow(t / 90, 1.6) * 0.8 : 0));
  const shB = useTransform(th, (t) => (t >= 90 ? Math.pow(2 - t / 90, 1.6) * 0.7 : 0));
  const shR = useTransform(th, (t) => Math.pow(Math.sin((t * Math.PI) / 180), 1.8) * 0.5);
  // While the cover lies on the static half its hinge corners must round, or they'd peek out.
  const rightR = useTransform(th, (t) => (t >= 90 ? rad(G.R, G.R, G.R, G.R) : P ? rad(0, 0, G.R, G.R) : rad(0, G.R, G.R, 0)));
  const rightRin = useTransform(th, (t) => { const r = G.R - b; return t >= 90 ? rad(r, r, r, r) : P ? rad(0, 0, r, r) : rad(0, r, r, 0); });
  // Closed: slide so the closed phone sits centred. Open: flat.
  const devT = useTransform(k, (v) => (v < 0.003 ? "none" : P ? `translateY(${(-v * G.H) / 4}px)` : `translateX(${(-v * G.W) / 4}px)`));
  const shadowT = useTransform(k, (v) => `translateX(-50%) translateX(${P ? 0 : (G.W / 4) * v}px) scaleX(${P ? 1 : 0.5 + 0.5 * (1 - v)})`);
  const glowT = useTransform(k, (v) => `translate(-50%,-50%) scaleX(${P ? 1 : 0.55 + 0.45 * (1 - v)})`);
  const overlay = useTransform(k, (v) => Math.min(1, Math.max(0, (0.025 - v) * 40)));
  const y = useTransform(inner, (v) => -v);
  const measure = (el: HTMLDivElement | null) => {
    if (!el || !onContentHeight) return;
    const ro = new ResizeObserver(() => onContentHeight(el.offsetHeight));
    ro.observe(el);
  };
  // Inset of frame/bezel per side; the hinge side has none so the two halves meet seamlessly.
  const ins = (v: number, hinge: "left" | "right" | "top" | "bottom") =>
    ({ top: hinge === "top" ? 0 : v, right: hinge === "right" ? 0 : v, bottom: hinge === "bottom" ? 0 : v, left: hinge === "left" ? 0 : v });
  const fade = <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-11 bg-gradient-to-b from-background via-background/85 to-transparent" />;
  const yRight = useTransform(inner, (v) => (P ? -screenHalf.h - v : -v));

  const body = (r: string | MotionValue<string>) => ({
    borderRadius: r,
    background: `linear-gradient(135deg, ${F[2]} 0%, ${F[0]} 28%, ${F[1]} 72%, ${F[3]} 100%)`,
    boxShadow: `inset 0 0 0 1px ${F[3]}66, inset 0 1px 1px ${F[2]}`,
  });
  return (
    <div className="relative" style={{ width: G.W * scale, height: G.H * scale }}>
      {/* glow plate behind the device */}
      <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 rounded-full opacity-80 blur-[80px]"
        style={{ width: G.W * scale * 0.95, height: G.H * scale * 0.8, transform: glowT,
          background: "radial-gradient(closest-side, var(--glow-b), color-mix(in oklch, var(--glow-a) 60%, transparent) 60%, transparent)" }} />
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: G.W, height: G.H, transform: `scale(${scale})` }}>
        {/* floor shadow */}
        <motion.div aria-hidden className="absolute left-1/2 rounded-[50%] bg-black/45 blur-2xl dark:bg-black/80"
          style={{ bottom: -36, width: G.W * 0.9, height: 42, transform: shadowT }} />
        <motion.div className="absolute inset-0" style={{ transform: devT }}>
          {/* static half (right / bottom) */}
          <motion.div className="absolute" style={{ ...(P ? { left: 0, top: half.h } : { left: half.w, top: 0 }), width: half.w, height: half.h, visibility: rightVis, ...body(rightR) }}>
            <motion.div className="absolute overflow-hidden" style={{ ...ins(G.f, P ? "top" : "left"), borderRadius: rightRin, background: "#05070a" }}>
              <div className="absolute overflow-hidden bg-background" style={{ ...ins(G.bz, P ? "top" : "left"), borderRadius: "inherit" }}>
                <motion.div style={{ y: yRight, x: P ? 0 : -screenHalf.w, width: P ? screenHalf.w : screenHalf.w * 2 }} className="absolute left-0 top-0">{screen}</motion.div>
                {!P && fade}
              </div>
              {/* crease: a soft valley with a thin specular ridge, not a flat line */}
              <div aria-hidden className="pointer-events-none absolute" style={P
                ? { left: 0, right: 0, top: -6, height: 14, background: "linear-gradient(180deg, rgba(0,0,0,.22), rgba(255,255,255,.14) 40%, rgba(0,0,0,.12) 65%, transparent)" }
                : { top: 0, bottom: 0, left: -6, width: 14, background: "linear-gradient(90deg, rgba(0,0,0,.22), rgba(255,255,255,.14) 40%, rgba(0,0,0,.12) 65%, transparent)" }} />
            </motion.div>
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: shR, borderRadius: rightR }} />
          </motion.div>

          {/* moving half — front (screen) */}
          <motion.div className="absolute [backface-visibility:hidden]" style={{
            left: 0, top: 0, width: half.w, height: half.h, visibility: leafVis, transform: leafT,
            transformOrigin: P ? "50% 100%" : "100% 50%", ...body(P ? rad(G.R, G.R, 0, 0) : rad(G.R, 0, 0, G.R)),
          }}>
            <div className="absolute overflow-hidden" style={{ ...ins(G.f, P ? "bottom" : "right"), borderRadius: P ? rad(G.R - G.f, G.R - G.f, 0, 0) : rad(G.R - G.f, 0, 0, G.R - G.f), background: "#05070a" }}>
              <div className="absolute overflow-hidden bg-background" style={{ ...ins(G.bz, P ? "bottom" : "right"), borderRadius: "inherit" }}>
                <motion.div style={{ y, width: P ? screenHalf.w : screenHalf.w * 2 }} className="absolute left-0 top-0"><div ref={measure}>{screen}</div></motion.div>
                {fade}
              </div>
              <div aria-hidden className="pointer-events-none absolute" style={P
                ? { left: 0, right: 0, bottom: -6, height: 14, background: "linear-gradient(0deg, rgba(0,0,0,.22), rgba(255,255,255,.14) 40%, rgba(0,0,0,.12) 65%, transparent)" }
                : { top: 0, bottom: 0, right: -6, width: 14, background: "linear-gradient(270deg, rgba(0,0,0,.22), rgba(255,255,255,.14) 40%, rgba(0,0,0,.12) 65%, transparent)" }} />
            </div>
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: shF, borderRadius: "inherit" }} />
          </motion.div>

          {/* moving half — back (cover screen), all corners rounded when closed */}
          <motion.div className="absolute [backface-visibility:hidden]" style={{
            ...(P ? { left: 0, top: half.h } : { left: half.w, top: 0 }), width: half.w, height: half.h, visibility: coverVis, transform: coverT,
            transformOrigin: P ? "50% 0%" : "0% 50%", ...body(rad(G.R, G.R, G.R, G.R)),
          }}>
            <div className="absolute overflow-hidden" style={{ inset: G.f, borderRadius: G.R - G.f, background: "#05070a" }}>
              <div className="absolute overflow-hidden bg-background" style={{ inset: G.bz, borderRadius: G.R - b }}>{cover}</div>
            </div>
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: shB, borderRadius: G.R }} />
            {/* specular sweep across the closed glass */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: G.R }}>
              <div className="absolute -inset-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </motion.div>

          {/* status bar — only when flat open */}
          {statusBar && (
            <motion.div aria-hidden className="pointer-events-none absolute flex items-center justify-between font-mono text-[13px] font-medium text-foreground/80"
              style={{ left: b + 22, right: b + 22, top: b + 10, opacity: overlay }}>
              <span>9:41</span>
              <span className="flex items-center gap-1.5"><span className="tracking-tight">5G</span>
                <span className="relative inline-block h-[11px] w-[22px] rounded-[3px] border border-current p-[1.5px]"><span className="block h-full w-[70%] rounded-[1.5px] bg-current" /></span></span>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

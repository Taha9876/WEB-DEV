"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ReactLenis } from "lenis/react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, BellRing, CalendarCheck2, CreditCard, GitBranch, History, LayoutDashboard,
  MessageCircle, ShieldCheck, Sparkles, Timer, UserCheck, Users, Zap,
} from "lucide-react";

const HeroCanvas = dynamic(() => import("./hero-canvas"), { ssr: false });
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: (i = 0) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: EASE, delay: 0.08 * i } }),
};

export function Landing() {
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true }}>
      <div className="relative min-h-dvh overflow-x-clip bg-background">
        <Nav />
        <Hero />
        <Proof />
        <Chain />
        <Bento />
        <AISection />
        <Integrations />
        <CTA />
        <Footer />
      </div>
    </ReactLenis>
  );
}

/* ---------------------------------------------------------------- Nav */
function Nav() {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 120], ["oklch(0.135 0.006 265 / 0)", "oklch(0.135 0.006 265 / 0.72)"]);
  const border = useTransform(scrollY, [0, 120], ["oklch(1 0 0 / 0)", "oklch(1 0 0 / 0.08)"]);
  return (
    <motion.header style={{ backgroundColor: bg, borderColor: border }} className="fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5 font-medium tracking-tight">
          <Logo /> Relay
        </Link>
        <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#platform" className="transition-colors hover:text-foreground">Platform</a>
          <a href="#ai" className="transition-colors hover:text-foreground">AI</a>
          <a href="#integrations" className="transition-colors hover:text-foreground">Integrations</a>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">Sign in</Link>
          <Link href="/signup" className="group inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform active:scale-[0.97]">
            Start free <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}

export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeOpacity=".25" />
      <path d="M9 21.5 16 8l7 13.5" fill="none" stroke="var(--signal)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="21.5" r="2.4" fill="var(--signal)" />
    </svg>
  );
}

/* ---------------------------------------------------------------- Hero */
function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);

  return (
    <section ref={ref} className="grain relative isolate flex min-h-[100svh] items-center overflow-hidden pt-16">
      {/* atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[38%] size-[70rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.91_0.2_125/0.10),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.035)_1px,transparent_1px)] bg-[size:64px_64px] mask-radial" />
      </div>
      <motion.div style={{ scale, opacity: fade }} className="absolute inset-0 -z-10 lg:left-[38%]">
        <HeroCanvas />
      </motion.div>

      <motion.div style={{ y, opacity: fade }} className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative z-10">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/60 py-1 pl-1 pr-3 text-xs text-muted-foreground backdrop-blur">
            <span className="rounded-full bg-signal/15 px-2 py-0.5 font-medium text-signal">New</span>
            AI first-response for every lead
          </motion.div>
          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
            className="text-gradient text-balance font-display text-[clamp(3.2rem,8vw,6.8rem)] leading-[0.92] tracking-[-0.02em]">
            No lead <em className="italic">left</em><br /> behind.
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
            className="mt-7 max-w-[34rem] text-pretty text-lg leading-relaxed text-muted-foreground">
            Relay gives every inbound lead exactly one accountable owner, a visible deadline, and an automatic
            escalation path — with WhatsApp, payments and calendars wired into the same customer record.
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-10 flex flex-wrap items-center gap-3">
            <MagneticButton href="/signup">Create your workspace</MagneticButton>
            <Link href="#how" className="rounded-full border border-hairline px-5 py-3 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
              See how it works
            </Link>
          </motion.div>
          <motion.dl variants={fadeUp} initial="hidden" animate="show" custom={4} className="mt-14 flex gap-10 text-sm">
            {[["1", "owner per lead, always"], ["0", "leads silently dropped"], ["4", "live integrations"]].map(([n, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-4xl text-foreground">{n}</dd>
                <dd className="mt-1 max-w-28 text-xs leading-snug text-muted-foreground">{l}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        <motion.div initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 1.2, ease: EASE, delay: 0.5 }}
          className="relative z-10 hidden translate-y-28 justify-self-end [perspective:1200px] lg:block">
          <LeadTicket />
        </motion.div>
      </motion.div>

      <motion.div style={{ opacity: fade }} className="absolute inset-x-0 bottom-8 flex justify-center">
        <div className="flex h-9 w-5 justify-center rounded-full border border-hairline pt-2">
          <motion.span animate={{ y: [0, 10, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 2, repeat: Infinity }} className="h-1.5 w-0.5 rounded-full bg-muted-foreground" />
        </div>
      </motion.div>
    </section>
  );
}

function MagneticButton({ href, children }: { href: string; children: React.ReactNode }) {
  const x = useSpring(0, { stiffness: 220, damping: 18 }), y = useSpring(0, { stiffness: 220, damping: 18 });
  return (
    <motion.div style={{ x, y }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * 0.25); y.set((e.clientY - r.top - r.height / 2) * 0.35); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      <Link href={href} className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-signal px-6 py-3 text-sm font-medium text-signal-foreground shadow-[0_0_0_1px_oklch(0.91_0.2_125/0.4),0_12px_40px_-8px_oklch(0.91_0.2_125/0.55)] transition-transform active:scale-[0.97]">
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <span className="relative">{children}</span>
        <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}

/* A product-in-hero: a lead travelling the escalation chain in real time. */
const STEPS = [
  { who: "Ayesha R.", role: "Sales · round-robin", state: "waiting" },
  { who: "Bilal K.", role: "Next available", state: "waiting" },
  { who: "Hina S.", role: "Designated backup", state: "ack" },
] as const;

/** Deterministic timeline: Ayesha misses (10s), Bilal misses (10s), Hina acknowledges at 4s left, hold, loop. */
const WINDOW = 10, HOLD = 8;
function LeadTicket() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v + 1) % (WINDOW * 3 + HOLD)), 380);
    return () => clearInterval(id);
  }, []);
  const active = Math.min(2, Math.floor(t / WINDOW));
  const elapsed = t - active * WINDOW;
  const acked = active === 2 && elapsed >= WINDOW - 4;
  const left = acked ? 4 : WINDOW - elapsed;
  const pct = left / WINDOW;
  return (
    <div className="edge w-[23rem] rounded-3xl !bg-surface/55 p-5 backdrop-blur-2xl">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-emerald-300/30 to-signal/20 text-sm font-medium">SK</div>
          <div>
            <p className="font-medium">Sara Khan</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircle className="size-3" /> WhatsApp · Rooftop solar quote</p>
          </div>
        </div>
        <Ring pct={pct} danger={!acked && left <= 3} label={acked ? "✓" : `${left}s`} />
      </div>
      <div className="mt-4 rounded-2xl bg-background/60 p-3 text-sm leading-relaxed text-muted-foreground">
        “Hi, I need a quote for a 10kW system before Friday. Can someone call me?”
      </div>
      <ol className="mt-5 space-y-2" aria-label="Escalation chain">
        {STEPS.map((s, i) => {
          const state = i < active ? "missed" : i === active ? (acked ? "ack" : "live") : "next";
          return (
            <motion.li key={s.who} layout className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              animate={{ backgroundColor: state === "live" ? "oklch(1 0 0 / 0.05)" : "oklch(1 0 0 / 0)", opacity: state === "next" ? 0.45 : 1 }}>
              <span className={`relative grid size-6 place-items-center rounded-full text-[10px] ${state === "ack" ? "bg-ok/20 text-ok" : state === "missed" ? "bg-ember/15 text-ember" : state === "live" ? "bg-signal/15 text-signal" : "bg-muted text-muted-foreground"}`}>
                {state === "live" && <span className="absolute inset-0 animate-pulse-ring rounded-full text-signal" />}
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm">{s.who}</p>
                <p className="text-[11px] text-muted-foreground">{s.role}</p>
              </div>
              <AnimatePresence mode="wait">
                <motion.span key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  className={`text-[11px] font-medium ${state === "ack" ? "text-ok" : state === "missed" ? "text-ember" : state === "live" ? "text-signal" : "text-muted-foreground"}`}>
                  {state === "ack" ? "Acknowledged" : state === "missed" ? "Escalated" : state === "live" ? "Waiting…" : "Queued"}
                </motion.span>
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ol>
      <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-4 text-[11px] text-muted-foreground">
        <BellRing className="size-3.5 text-signal" /> Telegram alert sent on every escalation
      </div>
    </div>
  );
}

function Ring({ pct, danger, label }: { pct: number; danger: boolean; label: string }) {
  const C = 2 * Math.PI * 18;
  return (
    <div className="relative grid size-12 place-items-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="3" />
        <motion.circle cx="22" cy="22" r="18" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - pct), stroke: danger ? "var(--ember)" : "var(--signal)" }} transition={{ duration: 0.3, ease: "linear" }} />
      </svg>
      <span className="font-mono text-[11px] tabular">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- Proof strip */
function Proof() {
  const items = ["Real estate agencies", "Solar installers", "Clinic patient teams", "Home services", "Education counsellors", "Car dealerships"];
  return (
    <section className="relative border-y border-hairline py-6" aria-label="Who it's for">
      <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
        <motion.div className="flex shrink-0 gap-16 pr-16" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
          {[...items, ...items].map((t, i) => (
            <span key={i} className="whitespace-nowrap text-sm text-muted-foreground/70">{t}</span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- How it works (scroll-driven) */
const CHAIN = [
  { icon: Zap, t: "Capture", d: "Web form, WhatsApp message or manual entry — every lead is born with a source label and a contact record." },
  { icon: Users, t: "Assign", d: "Round-robin across employees who are Available and under their open-lead limit. Nobody on leave ever gets one." },
  { icon: Timer, t: "Acknowledge", d: "The owner sees a live countdown. A note, reply, call or stage change counts as acknowledgement." },
  { icon: GitBranch, t: "Escalate", d: "Window expires → next employee → backup → manager. Levels and timers are yours to configure." },
  { icon: UserCheck, t: "Recover", d: "Anything that slipped lands in the recovery queue with the reason — and the audit trail proves who held it." },
];

function Chain() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 60%", "end 70%"] });
  const line = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [active, setActive] = useState(0);
  useEffect(() => scrollYProgress.on("change", (v) => setActive(Math.min(CHAIN.length - 1, Math.floor(v * CHAIN.length)))), [scrollYProgress]);

  return (
    <section id="how" ref={ref} className="relative mx-auto max-w-7xl px-4 py-32 sm:px-6 md:py-44">
      <SectionHead eyebrow="How it works" title={<>Five steps. <em className="italic text-muted-foreground">Zero</em> blind spots.</>}
        body="The lead engine runs on durable timers in the database, so a server restart never loses a deadline — and two timers firing together never escalate the same lead twice." />
      <div className="relative mt-20 grid gap-4 md:grid-cols-[3rem_1fr] md:gap-x-10">
        <div className="absolute bottom-0 left-[1.45rem] top-0 hidden w-px bg-hairline md:block">
          <motion.div style={{ scaleY: line }} className="h-full w-full origin-top bg-gradient-to-b from-signal via-signal to-transparent" />
        </div>
        {CHAIN.map((c, i) => (
          <motion.div key={c.t} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-20%" }}
            transition={{ duration: 0.8, ease: EASE }} className="contents">
            <div className="relative z-10 hidden md:block">
              <motion.div animate={{ scale: active === i ? 1 : 0.85, backgroundColor: active >= i ? "var(--signal)" : "var(--surface)", color: active >= i ? "var(--signal-foreground)" : "var(--muted-foreground)" }}
                transition={{ duration: 0.5, ease: EASE }} className="mt-6 grid size-12 place-items-center rounded-2xl border border-hairline">
                <c.icon className="size-5" />
              </motion.div>
            </div>
            <motion.div animate={{ opacity: active === i ? 1 : 0.55 }} className="edge mb-4 rounded-3xl p-6 md:p-8">
              <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-2 font-display text-3xl md:text-4xl">{c.t}</h3>
              <p className="mt-3 max-w-xl text-muted-foreground">{c.d}</p>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: React.ReactNode; body?: string }) {
  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-15%" }} className="max-w-3xl">
      <motion.p variants={fadeUp} custom={0} className="mb-4 text-sm font-medium text-signal">{eyebrow}</motion.p>
      <motion.h2 variants={fadeUp} custom={1} className="text-balance font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-[1] tracking-[-0.015em]">{title}</motion.h2>
      {body && <motion.p variants={fadeUp} custom={2} className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">{body}</motion.p>}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Bento */
function Spotlight({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const mx = useMotionValue(-400), my = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, oklch(0.91 0.2 125 / 0.08), transparent 60%)`;
  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10%" }} variants={fadeUp}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mx.set(e.clientX - r.left); my.set(e.clientY - r.top); }}
      onPointerLeave={() => { mx.set(-400); my.set(-400); }}
      className={`edge group relative overflow-hidden rounded-3xl p-6 ${className}`}>
      <motion.div style={{ background: bg }} className="pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function Bento() {
  return (
    <section id="platform" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="One platform" title={<>Everything about a customer, <em className="italic text-muted-foreground">on one page.</em></>}
        body="Conversations, opportunities, payments, appointments, the owner and the full history — no more tab-switching, no side spreadsheets." />
      <div className="mt-16 grid auto-rows-[minmax(15rem,auto)] gap-4 md:grid-cols-6">
        <Spotlight className="md:col-span-4">
          <CardHead icon={LayoutDashboard} t="A CRM shaped like your business" d="Custom fields, per-pipeline field sets, stage gates that block a move until required fields are filled." />
          <MiniKanban />
        </Spotlight>
        <Spotlight className="md:col-span-2">
          <CardHead icon={MessageCircle} t="WhatsApp, in the record" d="Signed webhooks, delivery receipts, retries, opt-outs." />
          <MiniChat />
        </Spotlight>
        <Spotlight className="md:col-span-2">
          <CardHead icon={CreditCard} t="Get paid from the deal" d="Stripe checkout links; status flips the moment the webhook lands." />
          <MiniPayment />
        </Spotlight>
        <Spotlight className="md:col-span-2">
          <CardHead icon={CalendarCheck2} t="Real calendars" d="Google Calendar OAuth, busy-time conflict checks, time-zone safe." />
          <MiniCalendar />
        </Spotlight>
        <Spotlight className="md:col-span-2">
          <CardHead icon={History} t="Tamper-proof audit" d="Append-only at the database level. Who, what, when, before and after." />
          <MiniAudit />
        </Spotlight>
        <Spotlight className="md:col-span-3">
          <CardHead icon={ShieldCheck} t="Permissions, not job titles" d="Roles are bags of permissions. Opportunity values masked for whoever shouldn't see them — in lists, details and exports." />
          <div className="mt-6 flex flex-wrap gap-2">
            {["crm.view", "crm.edit", "crm.export", "crm.view_value", "leads.manage", "audit.view", "integrations.manage"].map((p, i) => (
              <motion.span key={p} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                className={`rounded-full border px-3 py-1 font-mono text-xs ${i % 3 === 1 ? "border-hairline text-muted-foreground line-through decoration-ember/60" : "border-signal/30 bg-signal/10 text-signal"}`}>{p}</motion.span>
            ))}
          </div>
        </Spotlight>
        <Spotlight className="md:col-span-3">
          <CardHead icon={LayoutDashboard} t="A dashboard that never disagrees with itself" d="Every figure follows one definition and drills down to the exact records behind it." />
          <MiniBars />
        </Spotlight>
      </div>
    </section>
  );
}

function CardHead({ icon: I, t, d }: { icon: React.ElementType; t: string; d: string }) {
  return (
    <div>
      <I className="size-5 text-signal" aria-hidden />
      <h3 className="mt-4 text-lg font-medium tracking-tight">{t}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{d}</p>
    </div>
  );
}

function MiniKanban() {
  const cols = [["New", 3], ["Qualified", 2], ["Site visit", 2], ["Won", 1]] as const;
  return (
    <div className="mt-6 grid grid-cols-4 gap-2">
      {cols.map(([n, c], ci) => (
        <div key={n} className="rounded-xl bg-background/50 p-2">
          <p className="mb-2 px-1 text-[11px] text-muted-foreground">{n}</p>
          {Array.from({ length: c }).map((_, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.1 + i * 0.06, ease: EASE, duration: 0.6 }}
              className={`mb-1.5 h-9 rounded-lg border border-hairline ${ci === 3 ? "bg-ok/10" : "bg-elevated"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MiniChat() {
  return (
    <div className="mt-5 space-y-2 text-xs">
      <motion.p initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} className="w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-background/60 px-3 py-2">Is Saturday possible for the visit?</motion.p>
      <motion.p initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-signal/15 px-3 py-2 text-foreground">Yes — 11:00 works. Booking it now ✓✓</motion.p>
    </div>
  );
}

function MiniPayment() {
  return (
    <div className="mt-5 flex items-center justify-between rounded-2xl bg-background/60 p-3">
      <div><p className="text-xs text-muted-foreground">Deposit · INV-2041</p><p className="font-mono text-lg tabular">$1,250.00</p></div>
      <motion.span initial={{ backgroundColor: "oklch(0.84 0.14 85 / 0.15)", color: "var(--warn)" }} whileInView={{ backgroundColor: "oklch(0.8 0.16 155 / 0.15)", color: "var(--ok)" }}
        transition={{ delay: 0.8, duration: 0.6 }} className="rounded-full px-2.5 py-1 text-xs font-medium">Paid</motion.span>
    </div>
  );
}

function MiniCalendar() {
  return (
    <div className="mt-5 grid grid-cols-5 gap-1">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className={`h-6 rounded-md ${i === 7 ? "bg-signal/70" : [2, 3, 11].includes(i) ? "bg-muted-foreground/25" : "bg-background/60"}`} />
      ))}
    </div>
  );
}

function MiniAudit() {
  const rows = ["lead.escalated · system", "role.updated · Owner", "stage.deleted · Admin"];
  return (
    <ul className="mt-5 space-y-1.5 font-mono text-[11px] text-muted-foreground">
      {rows.map((r, i) => (
        <motion.li key={r} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: i * 0.15 }} className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-signal" />{r}
        </motion.li>
      ))}
    </ul>
  );
}

function MiniBars() {
  const v = [40, 62, 35, 80, 55, 92, 70];
  return (
    <div className="mt-6 flex h-24 items-end gap-2">
      {v.map((h, i) => (
        <motion.div key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} transition={{ duration: 0.9, delay: i * 0.06, ease: EASE }}
          className={`flex-1 rounded-t-md ${i === 5 ? "bg-signal" : "bg-muted-foreground/20"}`} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- AI */
function AISection() {
  const features = [
    { t: "Instant first response", d: "When nobody acknowledges in time, Relay's AI replies on WhatsApp in the customer's language so they're never left on read — clearly labelled, and the human owner still gets the lead." },
    { t: "Lead triage", d: "Every inbound message is scored for intent and urgency, summarised, and its details (budget, location, timeline) extracted into your custom fields." },
    { t: "Reply copilot", d: "Drafts the next message from the whole customer record — stage, payments, appointments — one tap to send." },
    { t: "Ask your pipeline", d: "“Hot solar leads in Lahore this week owned by Bilal” becomes a saved list that keeps itself up to date." },
  ];
  return (
    <section id="ai" className="relative overflow-hidden py-28 md:py-40">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_180deg,oklch(0.91_0.2_125/0.08),oklch(0.72_0.14_300/0.08),oklch(0.78_0.11_215/0.08),oklch(0.91_0.2_125/0.08))] blur-3xl" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead eyebrow="Relay AI" title={<>The teammate that <em className="italic text-muted-foreground">never</em> misses a notification.</>} />
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-hairline bg-hairline md:grid-cols-2">
          {features.map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.8 }}
              className="bg-background p-8 md:p-10">
              <Sparkles className="size-5 text-signal" aria-hidden />
              <h3 className="mt-5 text-xl font-medium tracking-tight">{f.t}</h3>
              <p className="mt-2 text-muted-foreground">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Integrations */
function Integrations() {
  const items = [
    { n: "Twilio WhatsApp", d: "Messaging & lead capture" },
    { n: "Stripe", d: "Checkout, webhooks, refunds" },
    { n: "Google Calendar", d: "OAuth 2.0, free/busy" },
    { n: "Telegram", d: "Escalation alerts" },
  ];
  return (
    <section id="integrations" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="Integrations" title={<>Real services. <em className="italic text-muted-foreground">Real</em> failure handling.</>}
        body="Every webhook is signature-verified and idempotent. Every outbound call is logged, retried with back-off, and explained in plain language when it can't succeed." />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <motion.div key={it.n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.8, ease: EASE }}
            whileHover={{ y: -4 }} className="edge rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <p className="font-medium">{it.n}</p>
              <span className="flex items-center gap-1.5 text-[11px] text-ok"><span className="size-1.5 rounded-full bg-ok" />Live</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{it.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- CTA + footer */
function CTA() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE }}
        className="grain relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-hairline bg-surface px-6 py-20 text-center md:py-28">
        <div className="pointer-events-none absolute inset-x-0 -bottom-1/2 mx-auto h-[30rem] max-w-3xl rounded-full bg-signal/20 blur-[120px]" />
        <h2 className="relative mx-auto max-w-3xl text-balance font-display text-[clamp(2.6rem,6vw,5rem)] leading-[0.95]">
          Your next customer is messaging <em className="italic">right now.</em>
        </h2>
        <p className="relative mx-auto mt-6 max-w-xl text-muted-foreground">Set up a workspace in under a minute. Invite your team, connect WhatsApp, and never wonder who dropped the ball again.</p>
        <div className="relative mt-10 flex justify-center"><MagneticButton href="/signup">Create your workspace</MagneticButton></div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <span className="flex items-center gap-2"><Logo className="size-5" /> Relay — Team 65</span>
        <span>Built for the Unified Business Management Platform challenge.</span>
      </div>
    </footer>
  );
}

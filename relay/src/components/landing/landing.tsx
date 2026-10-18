"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactLenis } from "lenis/react";
import { motion, useInView, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, BellRing, CalendarCheck2, CreditCard, GitBranch, History, LayoutDashboard, Lock, MessageCircle, ShieldCheck, Sparkles, Timer, UserCheck, Users, Zap,
} from "lucide-react";
import { Aurora } from "@/components/aurora";
import { Smoke } from "@/components/smoke";
import { ThemeToggle } from "@/components/theme";
import { FoldDevice, GEO, useOrientation } from "./fold-device";
import { CoverDone, CoverIncoming, DeviceScreen } from "./device-screens";
import { CustomerView, FAQ, Industries, ProblemFix, Security, VelocityMarquee } from "./landing-sections";
import { CountUp, EASE, Logo, SectionHead, Words } from "./shared";

export { Logo };


export function Landing() {
  return (
    <ReactLenis root options={{ lerp: 0.09, smoothWheel: true }}>
      <Aurora />
      <Smoke />
      <div className="relative min-h-dvh overflow-x-clip">
        <Nav />
        <HeroFold />
        <Counters />
        <VelocityMarquee />
        <ProblemFix />
        <Chain />
        <Industries />
        <Bento />
        <CustomerView />
        <AISection />
        <Security />
        <Integrations />
        <FAQ />
        <CTA />
        <Footer />
      </div>
    </ReactLenis>
  );
}

/* ---------------------------------------------------------------- nav: a floating pill that frosts in as you scroll */
function Nav() {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 120], ["color-mix(in oklch, var(--background) 0%, transparent)", "color-mix(in oklch, var(--background) 70%, transparent)"]);
  const border = useTransform(scrollY, [0, 120], ["color-mix(in oklch, var(--hairline) 0%, transparent)", "color-mix(in oklch, var(--hairline) 100%, transparent)"]);
  const blur = useTransform(scrollY, [0, 120], ["blur(0px)", "blur(16px)"]);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
      <motion.nav style={{ backgroundColor: bg, borderColor: border, backdropFilter: blur }} aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border px-3">
        <Link href="/" className="flex items-center gap-2 pl-2 font-semibold tracking-tight"><Logo /> Relay</Link>
        <div className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {[["How it works", "#how"], ["Platform", "#platform"], ["AI", "#ai"], ["Integrations", "#integrations"]].map(([l, h]) => (
            <a key={h} href={h} className="rounded-full px-3 py-1.5 transition-colors hover:bg-foreground/5 hover:text-foreground">{l}</a>))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="hidden rounded-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block">Sign in</Link>
          <Link href="/signup" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.97]">Start free</Link>
        </div>
      </motion.nav>
    </header>
  );
}

/* ---------------------------------------------------------------- hero + fold device, scroll-driven */
function HeroFold() {
  const ref = useRef<HTMLElement>(null);
  const { o, vw, vh } = useOrientation();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.6 });
  const G = GEO[o];
  const scale = Math.min((vw * (o === "portrait" ? 0.9 : 0.82)) / G.W, (vh * 0.74) / G.H, 1);
  const screenH = G.H - 2 * (G.f + G.bz); // full display height (both halves when open)
  const [contentH, setContentH] = useState(o === "portrait" ? 1500 : 900);

  // Phases: rise (0–.14) · open (.10–.36) · scroll the screen (.38–.78) · fold shut (.82–.97)
  const k = useTransform(p, [0, 0.1, 0.36, 0.82, 0.97], [1, 1, 0, 0, 1]);
  const inner = useTransform(p, [0.38, 0.78], [0, Math.max(0, contentH - screenH)]);
  const [end, setEnd] = useState(false);
  useEffect(() => p.on("change", (v) => setEnd(v > 0.8)), [p]);
  const heroOpacity = useTransform(p, [0, 0.12], [1, 0]);
  const heroY = useTransform(p, [0, 0.14], [0, -120]);
  const devY = useTransform(p, [0, 0.14], [vh * (o === "portrait" ? 0.66 : 0.6), 0]);
  const devScale = useTransform(p, [0, 0.14], [0.78, 1]);
  const captionO = useTransform(p, [0.4, 0.46, 0.74, 0.8], [0, 1, 1, 0]);
  const endO = useTransform(p, [0.9, 0.97], [0, 1]);

  return (
    <section ref={ref} className="relative" style={{ height: "420vh" }} aria-label="Relay — no lead left behind">
      <div className="sticky top-0 flex h-dvh items-center justify-center overflow-hidden">
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="absolute inset-x-0 top-[13vh] z-10 px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-hairline bg-background/50 px-3 py-1 text-sm text-muted-foreground backdrop-blur">
            <span className="font-semibold italic text-foreground">relay</span><Logo className="size-3.5" /> lead protection for service teams
          </motion.div>
          <h1 className="font-display text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.98]">
            <Words text="No lead left behind." /><br className="hidden sm:block" /> <Words text="" accent="Every reply on time." delay={0.25} />
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 1 }} className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
            One accountable owner for every inbound lead, a visible deadline, and automatic escalation — with WhatsApp, payments and calendars on the same record.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.8, ease: EASE }}><EmailCapture /></motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-5 text-sm text-muted-foreground">
            WhatsApp <span className="mx-1.5 opacity-40">•</span> Stripe <span className="mx-1.5 opacity-40">•</span> Google Calendar <span className="mx-1.5 opacity-40">•</span> Telegram
          </motion.p>
        </motion.div>

        <motion.div style={{ y: devY, scale: devScale }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 1.2 }}>
          <FoldDevice k={k} inner={inner} o={o} scale={scale} screen={<DeviceScreen o={o} />} cover={end ? <CoverDone /> : <CoverIncoming />} onContentHeight={setContentH} />
        </motion.div>

        <motion.p style={{ opacity: captionO }} className="absolute bottom-[5vh] left-1/2 w-[min(90vw,36rem)] -translate-x-1/2 text-center text-sm text-muted-foreground">
          Leads, timers, escalations, WhatsApp, payments and appointments — one screen, live.
        </motion.p>
        <motion.p style={{ opacity: endO }} className="absolute bottom-[6vh] left-1/2 -translate-x-1/2 text-center font-display text-2xl">Folded. <em>Handled.</em></motion.p>
      </div>
    </section>
  );
}

function EmailCapture() {
  const router = useRouter();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("email"); router.push(`/signup${v ? `?email=${encodeURIComponent(String(v))}` : ""}`); }}
      className="mx-auto mt-9 flex w-full max-w-md items-center rounded-full border border-hairline bg-background/60 p-1.5 shadow-[var(--shadow-edge)] backdrop-blur-xl focus-within:border-signal/50">
      <label htmlFor="hero-email" className="sr-only">Work email</label>
      <input id="hero-email" name="email" type="email" placeholder="Your work email" className="h-11 min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground" />
      <button className="group inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.97]">
        Get started <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></button>
    </form>
  );
}

function Counters() {
  const items = [
    { n: 1, s: "", l: "accountable owner per lead — never zero, never two" },
    { n: 3, s: "", l: "escalation levels by default: next available, backup, manager" },
    { n: 4, s: "", l: "real integrations: WhatsApp, Stripe, Google Calendar, Telegram" },
    { n: 100, s: "%", l: "of assignments, escalations and config changes audited" },
  ];
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6" aria-label="Relay in numbers">
      <div className="grid gap-px overflow-hidden rounded-[2rem] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <motion.div key={it.l} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.8, ease: EASE }}
            className="bg-background/70 p-8 backdrop-blur-xl">
            <p className="font-display text-6xl tabular"><CountUp to={it.n} suffix={it.s} /></p>
            <p className="mt-3 text-sm text-muted-foreground">{it.l}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- how it works */
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
    <section id="how" ref={ref} className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-36">
      <SectionHead eyebrow="How it works" title="Five steps." accent="Zero blind spots."
        body="Timers live in the database, so a restart never loses a deadline — and two timers firing together never escalate the same lead twice." />
      <div className="relative mt-16 grid gap-4 md:grid-cols-[3rem_1fr] md:gap-x-10">
        <div className="absolute bottom-0 left-[1.45rem] top-0 hidden w-px bg-hairline md:block">
          <motion.div style={{ scaleY: line }} className="h-full w-full origin-top bg-gradient-to-b from-signal via-accent-text to-transparent" />
        </div>
        {CHAIN.map((c, i) => (
          <div key={c.t} className="contents">
            <div className="relative z-10 hidden md:block">
              <motion.div animate={{ scale: active === i ? 1.08 : 0.9, backgroundColor: active >= i ? "var(--signal)" : "var(--surface)", color: active >= i ? "var(--signal-foreground)" : "var(--muted-foreground)",
                boxShadow: active === i ? "0 0 40px var(--signal)" : "0 0 0px transparent" }}
                transition={{ duration: 0.5, ease: EASE }} className="mt-6 grid size-12 place-items-center rounded-2xl border border-hairline"><c.icon className="size-5" /></motion.div>
            </div>
            <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: active === i ? 1 : 0.6, x: 0 }} viewport={{ margin: "-20%" }} transition={{ duration: 0.8, ease: EASE }}
              className="edge mb-2 rounded-3xl p-6 md:p-8">
              <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-2 font-display text-3xl md:text-4xl">{c.t}</h3>
              <p className="mt-3 max-w-xl text-muted-foreground">{c.d}</p>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- bento, with cursor-tracked light and tilt per card */
function Spotlight({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const mx = useMotionValue(-400), my = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(380px circle at ${mx}px ${my}px, color-mix(in oklch, var(--signal) 18%, transparent), transparent 65%)`;
  const rx = useSpring(0, { stiffness: 200, damping: 20 }), ry = useSpring(0, { stiffness: 200, damping: 20 });
  return (
    <motion.div initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport={{ once: true, margin: "-10%" }} transition={{ duration: 0.9, ease: EASE }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mx.set(e.clientX - r.left); my.set(e.clientY - r.top); rx.set(((e.clientY - r.top) / r.height - 0.5) * -5); ry.set(((e.clientX - r.left) / r.width - 0.5) * 5); }}
      onPointerLeave={() => { mx.set(-400); my.set(-400); rx.set(0); ry.set(0); }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={`edge group relative overflow-hidden rounded-3xl p-6 ${className}`}>
      <motion.div style={{ background: bg }} className="pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function Bento() {
  return (
    <section id="platform" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="One platform" title="Everything about a customer," accent="on one page."
        body="Conversations, opportunities, payments, appointments, the owner and the full history — no more tab-switching, no side spreadsheets." />
      <div className="mt-14 grid auto-rows-[minmax(15rem,auto)] gap-4 md:grid-cols-6">
        <Spotlight className="md:col-span-4"><CardHead icon={LayoutDashboard} t="A CRM shaped like your business" d="Custom fields, per-pipeline field sets, and stage gates that block a move until required fields are filled." /><MiniKanban /></Spotlight>
        <Spotlight className="md:col-span-2"><CardHead icon={MessageCircle} t="WhatsApp, in the record" d="Signed webhooks, delivery receipts, retries, opt-outs." /><MiniChat /></Spotlight>
        <Spotlight className="md:col-span-2"><CardHead icon={CreditCard} t="Get paid from the deal" d="Stripe checkout links; status flips the moment the webhook lands." /><MiniPayment /></Spotlight>
        <Spotlight className="md:col-span-2"><CardHead icon={CalendarCheck2} t="Real calendars" d="Google OAuth, free/busy conflict checks, time-zone safe." /><MiniCalendar /></Spotlight>
        <Spotlight className="md:col-span-2"><CardHead icon={History} t="Tamper-proof audit" d="Append-only at the database level. Who, what, when, before and after." /><MiniAudit /></Spotlight>
        <Spotlight className="md:col-span-3"><CardHead icon={ShieldCheck} t="Permissions, not job titles" d="Roles are bundles of permissions. Deal values are masked for whoever shouldn't see them — in lists, details and exports." />
          <div className="mt-6 flex flex-wrap gap-2">
            {["crm.view", "crm.edit", "crm.export", "crm.view_value", "leads.manage", "audit.view", "integrations.manage"].map((p, i) => (
              <motion.span key={p} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                className={`rounded-full border px-3 py-1 font-mono text-xs ${i % 3 === 1 ? "border-hairline text-muted-foreground line-through" : "border-signal/30 bg-signal/10 text-foreground"}`}>{p}</motion.span>))}
          </div></Spotlight>
        <Spotlight className="md:col-span-3"><CardHead icon={LayoutDashboard} t="Numbers that never disagree" d="Every figure follows one definition and drills down to the records behind it." /><MiniBars /></Spotlight>
      </div>
    </section>
  );
}
const CardHead = ({ icon: I, t, d }: { icon: React.ElementType; t: string; d: string }) => (
  <div><I className="size-5 text-accent-text" aria-hidden /><h3 className="mt-4 text-lg font-semibold tracking-tight">{t}</h3><p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{d}</p></div>
);
function MiniKanban() {
  const cols: [string, [string, string][]][] = [
    ["New", [["10kW rooftop", "$7.8k"], ["Hybrid + battery", "$9.2k"], ["5kW starter", "$3.9k"]]],
    ["Site survey", [["15kW net-metered", "$11.4k"], ["Villa 20kW", "$15.6k"]]],
    ["Proposal", [["Warehouse 250kW", "$185k"], ["Clinic roof", "$22k"]]],
    ["Won", [["8kW rooftop", "$6.1k"]]],
  ];
  return (<div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">{cols.map(([n, cards], ci) => (
    <div key={n} className="rounded-xl bg-foreground/[0.03] p-2">
      <p className="mb-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">{n}<span className="font-mono">{cards.length}</span></p>
      {ci === 2 && <p className="mb-1.5 flex items-center gap-1 px-1 text-[10px] text-ember"><Lock className="size-2.5" /> Needs survey date</p>}
      {cards.map(([t, v], i) => <motion.div key={t} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.1 + i * 0.06, ease: EASE, duration: 0.6 }}
        className={`mb-1.5 rounded-lg border border-hairline px-2 py-1.5 ${ci === 3 ? "bg-ok/15" : "bg-background/70"}`}>
        <p className="truncate text-[11px] font-medium">{t}</p><p className="font-mono text-[10px] text-muted-foreground">{v}</p></motion.div>)}
    </div>))}</div>);
}
const MiniChat = () => (<div className="mt-5 space-y-2 text-xs">
  <motion.p initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-foreground/5 px-3 py-2">Is Saturday possible for the visit?</motion.p>
  <motion.p initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-signal/15 px-3 py-2">Yes — 11:00 works. Booking it now.</motion.p>
  <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.7 }} className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">Sent · Delivered · <span className="text-accent-text">Read ✓✓</span></motion.p>
  <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1 }} className="rounded-lg border border-hairline px-2 py-1.5 text-[10px] text-muted-foreground">Signature verified · duplicate webhooks ignored · STOP honoured</motion.p></div>);
const MiniPayment = () => (<div className="mt-5 space-y-2">
  <div className="flex items-center justify-between rounded-2xl bg-foreground/[0.03] p-3">
    <div><p className="text-xs text-muted-foreground">Deposit · INV-2041</p><p className="font-mono text-lg tabular">$<CountUp to={1250} decimals={2} /></p></div>
    <motion.span initial={{ opacity: 0.3 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.6 }} className="rounded-full bg-ok/15 px-2.5 py-1 text-xs font-medium text-ok">Paid</motion.span></div>
  <div className="flex justify-between px-1 text-[11px] text-muted-foreground"><span>Requested by Bilal K.</span><span className="font-mono">pi_3Q…8fK</span></div>
  <div className="flex gap-1.5 px-1 text-[10px]">{["Pending", "Paid", "Refunded"].map((s, i) => <span key={s} className={`rounded-full px-2 py-0.5 ${i === 1 ? "bg-ok/15 text-ok" : "bg-foreground/5 text-muted-foreground"}`}>{s}</span>)}</div></div>);
function MiniCalendar() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const slots = ["09", "12", "16"];
  const busy = new Set(["Tue-09", "Wed-12", "Fri-16"]);
  return (<div className="mt-5">
    <div className="grid grid-cols-[2.5rem_repeat(5,1fr)] gap-1 text-[10px] text-muted-foreground"><span />{days.map((d) => <span key={d} className="text-center">{d}</span>)}</div>
    {slots.map((h, si) => (<div key={h} className="mt-1 grid grid-cols-[2.5rem_repeat(5,1fr)] gap-1">
      <span className="font-mono text-[10px] text-muted-foreground">{h}:00</span>
      {days.map((d, di) => { const k = `${d}-${h}`; const booked = k === "Thu-16";
        return <motion.span key={k} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: (si * 5 + di) * 0.03 }}
          className={`grid h-6 place-items-center rounded-md text-[9px] ${booked ? "bg-signal font-medium text-signal-foreground" : busy.has(k) ? "bg-foreground/15 text-muted-foreground" : "bg-foreground/[0.04]"}`}>{booked ? "Visit" : busy.has(k) ? "Busy" : ""}</motion.span>; })}
    </div>))}
    <p className="mt-2 text-[10px] text-muted-foreground">Thu 16:00 Asia/Karachi · 15:00 for Bilal in Dubai</p></div>);
}
const MiniAudit = () => (<ul className="mt-5 space-y-1.5 font-mono text-[11px] text-muted-foreground">{[["10:41", "lead.escalated", "system"], ["10:39", "role.updated", "Owner"], ["10:12", "stage.deleted", "Admin"], ["09:58", "integration.connected", "Admin"]].map(([t, a, w], i) => (
  <motion.li key={a} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-signal" />{t} {a} · {w}</motion.li>))}
  <li className="pt-1 text-[10px]">UPDATE / DELETE → rejected by trigger</li></ul>);
function MiniBars() {
  const v: [string, number][] = [["New", 40], ["Survey", 62], ["Proposal", 92], ["Won", 35]];
  return (<div className="mt-6 space-y-2">{v.map(([n, h], i) => (
    <div key={n} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">{n}</span>
      <span className="h-2.5 rounded-full bg-foreground/[0.06]"><motion.span initial={{ width: 0 }} whileInView={{ width: `${h}%` }} transition={{ duration: 0.9, delay: i * 0.08, ease: EASE }}
        className={`block h-full rounded-r-[4px] rounded-l-full ${i === 2 ? "bg-signal" : "bg-accent-text/60"}`} /></span>
      <span className="text-right font-mono tabular"><CountUp to={Math.round(h * 1.4)} suffix="k" /></span>
    </div>))}<p className="pt-1 text-[10px] text-muted-foreground">Click any figure → the exact records behind it</p></div>);
}

/* ---------------------------------------------------------------- AI */
function AISection() {
  const features = [
    { t: "Instant first response", d: "When nobody acknowledges in time, Relay's AI replies on WhatsApp in the customer's language — clearly labelled, and the human owner still owns the lead." },
    { t: "Lead triage", d: "Every inbound message is scored for urgency, summarised, and its details (budget, location, timeline) filled into your custom fields." },
    { t: "Reply copilot", d: "Drafts the next message from the whole record — stage, payments, appointments. A human always presses send." },
    { t: "Team briefing", d: "One paragraph on who's overloaded and what's slipping, built only from live numbers." },
  ];
  return (
    <section id="ai" className="relative py-24 md:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead eyebrow="Relay AI" title="The teammate that" accent="never misses a notification." />
        <div className="mt-14 grid gap-px overflow-hidden rounded-[2rem] border border-hairline bg-hairline md:grid-cols-2">
          {features.map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.8 }} className="group bg-background/70 p-8 backdrop-blur-xl md:p-10">
              <Sparkles className="size-5 text-accent-text transition-transform duration-500 group-hover:rotate-90 group-hover:scale-125" aria-hidden />
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{f.t}</h3><p className="mt-2 text-muted-foreground">{f.d}</p>
            </motion.div>))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- integrations */
function Integrations() {
  const items = [["Twilio WhatsApp", "Messaging & lead capture"], ["Stripe", "Checkout, webhooks, refunds"], ["Google Calendar", "OAuth 2.0, free/busy"], ["Telegram", "Escalation alerts"]];
  return (
    <section id="integrations" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="Integrations" title="Real services." accent="Real failure handling."
        body="Every webhook is signature-verified and idempotent. Every outbound call is logged, retried with back-off, and explained in plain language when it can't succeed." />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([n, d], i) => (
          <motion.div key={n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.8, ease: EASE }}
            whileHover={{ y: -6 }} className="edge rounded-3xl p-5">
            <div className="flex items-center justify-between"><p className="font-semibold">{n}</p><span className="flex items-center gap-1.5 text-[11px] text-ok"><span className="size-1.5 animate-pulse rounded-full bg-ok" />Live</span></div>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </motion.div>))}
      </div>
      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><BellRing className="size-4 text-accent-text" /> A Telegram alert reaches the new owner within the minute of every escalation.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- CTA + footer */
function CTA() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE }}
        className="edge relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] px-6 py-20 text-center md:py-28">
        <h2 className="mx-auto max-w-3xl font-display text-[clamp(2.4rem,6vw,4.6rem)] leading-[1]">Your next customer is messaging <em>right now.</em></h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground">Set up a workspace in under a minute. Invite your team, connect WhatsApp, and never wonder who dropped the ball again.</p>
        <EmailCapture />
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <span className="flex items-center gap-2"><Logo className="size-5" /> Relay — Team 65</span>
        <span>Built for the Unified Business Management Platform challenge.</span>
      </div>
    </footer>
  );
}

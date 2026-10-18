"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useScroll, useSpring, useTransform, useVelocity, wrap } from "motion/react";
import {
  BadgeCheck, Building2, CalendarCheck2, Check, CreditCard, Fingerprint, HeartPulse, Home, KeyRound, Lock, MessageCircle, Plus,
  ScrollText, ShieldCheck, Sun, X, Zap,
} from "lucide-react";
import { CountUp, Logo, SectionHead } from "./shared";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ================================================================ 1. Velocity marquee — skews with scroll speed */
export function VelocityMarquee() {
  const { scrollY } = useScroll();
  const v = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const skew = useTransform(v, [-2000, 0, 2000], [-8, 0, 8], { clamp: true });
  const boost = useTransform(v, [-2000, 0, 2000], [-4, 1, 4], { clamp: false });
  const x = useMotionValue(0);
  useAnimationFrame((_, dt) => { x.set(wrap(-50, 0, x.get() - 0.006 * dt * Math.max(1, Math.abs(boost.get())))); });
  const tx = useTransform(x, (n) => `${n}%`);
  const items = ["Real estate agencies", "Solar installers", "Clinic patient teams", "Home services", "Education counsellors", "Car dealerships", "Insurance brokers", "Interior studios"];
  return (
    <section aria-label="Who uses Relay" className="relative overflow-hidden border-y border-hairline bg-background/40 py-7 backdrop-blur-xl">
      <motion.div style={{ x: tx, skewX: skew }} className="flex w-max gap-12 whitespace-nowrap font-display text-3xl text-foreground/80 md:text-5xl">
        {[...items, ...items].map((t, i) => (
          <span key={i} className="flex items-center gap-12">{t}<Logo className="size-6 opacity-70" /></span>
        ))}
      </motion.div>
    </section>
  );
}

/* ================================================================ 2. Problem → fix: strike-through draws, then the fix flips in */
const PAIRS = [
  ["Leads are assigned informally — nobody is clearly responsible.", "Exactly one accountable owner per lead, recorded with every hand-off."],
  ["Absence, leave and overload are ignored when leads are handed out.", "Only Available employees under their open-lead limit receive leads."],
  ["Nobody is alerted when a lead waits too long.", "A visible countdown, then automatic escalation and a Telegram alert."],
  ["The CRM forces one fixed structure, so teams keep side spreadsheets.", "Custom fields, per-pipeline field sets and stage gates — no code."],
  ["Conversations, payments and appointments live in other apps.", "WhatsApp, Stripe and Google Calendar land on the same customer record."],
  ["Managers can't see response times or missed opportunities.", "A live dashboard with drill-down, and an audit log nobody can edit."],
];

export function ProblemFix() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="Why Relay" title="What goes wrong today," accent="and what changes." />
      <ol className="mt-14 space-y-3">
        {PAIRS.map(([bad, good], i) => (
          <li key={i} className="grid gap-3 md:grid-cols-2">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-12%" }} transition={{ duration: 0.7, ease: EASE }}
              className="relative flex items-start gap-3 rounded-2xl border border-hairline bg-background/50 p-5 backdrop-blur-xl">
              <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span className="relative text-muted-foreground">
                {bad}
                <motion.span aria-hidden initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: "-12%" }} transition={{ delay: 0.5, duration: 0.6, ease: EASE }}
                  className="absolute left-0 right-0 top-1/2 h-px origin-left bg-destructive/60" />
              </span>
            </motion.div>
            <motion.div initial={{ opacity: 0, rotateX: -80, y: 10 }} whileInView={{ opacity: 1, rotateX: 0, y: 0 }} viewport={{ once: true, margin: "-12%" }}
              transition={{ delay: 0.9, duration: 0.8, ease: EASE }} style={{ transformPerspective: 800, transformOrigin: "top" }}
              className="edge flex items-start gap-3 rounded-2xl p-5">
              <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /><span className="font-medium">{good}</span>
            </motion.div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ================================================================ 3. Industries — vertical scroll drives a horizontal pan */
const INDUSTRIES = [
  { icon: Home, n: "Real estate agency", d: "Portal and WhatsApp enquiries routed to the agent on duty; viewings booked straight onto their calendar.", stats: [[12, "", "agents"], [60, "s", "acknowledge window"], [3, "", "pipelines: rent, sale, commercial"]] },
  { icon: Sun, n: "Solar installer", d: "Roof type and system size are required before a deal can enter Proposal. Deposits collected by Stripe link.", stats: [[18, "", "staff"], [45, "s", "acknowledge window"], [8, "", "custom fields"]] },
  { icon: HeartPulse, n: "Clinic patient team", d: "Web-form enquiries escalate to the front-desk lead, then the practice manager. Every hand-off is audited.", stats: [[9, "", "coordinators"], [30, "s", "acknowledge window"], [2, "", "escalation levels"]] },
  { icon: Building2, n: "Home services", d: "Technicians on leave never receive jobs; their open requests move the moment they switch to Offline.", stats: [[25, "", "technicians"], [90, "s", "acknowledge window"], [4, "", "service pipelines"]] },
];

export function Industries() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(useSpring(scrollYProgress, { stiffness: 120, damping: 30 }), [0, 1], ["0%", `-${(INDUSTRIES.length - 1) * 100 / INDUSTRIES.length}%`]);
  const bar = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section ref={ref} className="relative" style={{ height: `${INDUSTRIES.length * 90}vh` }} aria-label="Example setups by industry">
      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SectionHead eyebrow="Built for service teams" title="Shaped to how" accent="your team sells." />
          <motion.div style={{ scaleX: bar }} className="mt-6 h-px origin-left bg-gradient-to-r from-signal to-accent-text" />
        </div>
        <motion.div style={{ x, width: `${INDUSTRIES.length * 100}%` }} className="mt-10 flex">
          {INDUSTRIES.map((it) => (
            <div key={it.n} className="px-4 sm:px-6" style={{ width: `${100 / INDUSTRIES.length}%` }}>
              <div className="edge mx-auto grid max-w-5xl gap-8 rounded-[2rem] p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
                <div>
                  <it.icon className="size-8 text-accent-text" aria-hidden />
                  <h3 className="mt-5 font-display text-4xl md:text-5xl">{it.n}</h3>
                  <p className="mt-4 max-w-md text-lg text-muted-foreground">{it.d}</p>
                  <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">Example setup</p>
                </div>
                <dl className="grid gap-3">
                  {it.stats.map(([n, s, l]) => (
                    <div key={l as string} className="rounded-2xl border border-hairline bg-background/60 p-5">
                      <dd className="font-display text-5xl tabular"><CountUp to={n as number} suffix={s as string} /></dd>
                      <dt className="mt-1 text-sm text-muted-foreground">{l}</dt>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================ 4. Customer view — phone frame revealed by an expanding circle */
export function CustomerView() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const r = useTransform(scrollYProgress, [0, 1], [8, 150]);
  const clip = useTransform(r, (v) => `circle(${v}% at 50% 50%)`);
  const rot = useTransform(scrollYProgress, [0, 1], [-12, 0]);
  const points = [
    [MessageCircle, "WhatsApp thread with delivery receipts and failure reasons"],
    [Zap, "Every lead, its owner and the time it took to respond"],
    [CreditCard, "Payment requests, who sent them, and Stripe's reference"],
    [CalendarCheck2, "Appointments on the employee's real Google Calendar"],
    [ScrollText, "A timeline of notes, stage changes, escalations and edits"],
  ] as const;
  return (
    <section ref={ref} className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 md:grid-cols-2 md:py-32">
      <div>
        <SectionHead eyebrow="Complete customer view" title="One page per customer." accent="Nothing in another tab." />
        <ul className="mt-8 space-y-3">
          {points.map(([I, t], i) => (
            <motion.li key={t} initial={{ opacity: 0, filter: "blur(6px)", x: -10 }} whileInView={{ opacity: 1, filter: "blur(0px)", x: 0 }} viewport={{ once: true }}
              transition={{ delay: 0.15 * i, duration: 0.7, ease: EASE }} className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl border border-hairline bg-background/60"><I className="size-4 text-accent-text" /></span>{t}
            </motion.li>
          ))}
        </ul>
      </div>
      <motion.div style={{ clipPath: clip, rotate: rot }} className="mx-auto w-full max-w-[340px]">
        <div className="device-frame aspect-[9/19]" style={{ borderRadius: 46 }}>
          <div className="device-bezel" style={{ borderRadius: 43, borderWidth: 8 }}>
            <div className="device-screen space-y-2.5 p-4 pt-10 text-[12px]" style={{ borderRadius: 35 }}>
              <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-signal/20 font-semibold">AA</span>
                <div><p className="text-[15px] font-semibold">Ahmed Ali</p><p className="text-muted-foreground">+92 300 111 0002 · Karachi</p></div></div>
              <div className="rounded-xl border border-hairline bg-background/70 p-2.5"><p className="mb-1 font-semibold">WhatsApp</p>
                <p className="w-fit rounded-xl rounded-bl-sm bg-muted px-2 py-1">15kW ka kitna kharcha?</p>
                <p className="ml-auto mt-1 w-fit rounded-xl rounded-br-sm bg-signal/15 px-2 py-1">3.1–3.4M PKR. Survey Thu 4pm?</p></div>
              <div className="rounded-xl border border-hairline bg-background/70 p-2.5"><p className="font-semibold">15kW net-metered</p><p className="text-muted-foreground">Site survey · $11,400 · Bilal K.</p></div>
              <div className="flex gap-2"><div className="flex-1 rounded-xl border border-hairline bg-background/70 p-2.5"><p className="text-muted-foreground">Deposit</p><p className="font-mono">$1,250</p><span className="text-[10px] text-ok">Paid</span></div>
                <div className="flex-1 rounded-xl border border-hairline bg-background/70 p-2.5"><p className="text-muted-foreground">Visit</p><p>Thu 16:00</p><span className="text-[10px] text-muted-foreground">Google</span></div></div>
              <div className="rounded-xl border border-hairline bg-background/70 p-2.5"><p className="mb-1 flex items-center justify-between font-semibold">Lead <span className="rounded-full bg-ok/15 px-1.5 text-[10px] font-medium text-ok">Acknowledged</span></p>
                <p className="text-muted-foreground">WhatsApp · owner Bilal K. · first response 38s</p></div>
              <div className="rounded-xl border border-signal/30 bg-signal/10 p-2.5"><p className="mb-1 font-semibold">AI triage</p>
                <p className="text-muted-foreground">Wants 15kW with net metering · urgency 82/100 · Roman Urdu</p>
                <span className="mt-1.5 block h-1 rounded-full bg-muted"><span className="block h-full w-[82%] rounded-full bg-ember" /></span></div>
              <div className="rounded-xl border border-hairline bg-background/70 p-2.5"><p className="mb-1 font-semibold">Activity</p>
                {["Escalated → manager", "Escalated → backup", "Note: prefers Urdu"].map((x) => <p key={x} className="text-muted-foreground">• {x}</p>)}</div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ================================================================ 5. Security — tiles pop in, numbers count */
export function Security() {
  const tiles = [
    { i: Fingerprint, n: 2, s: "", l: "Argon2id iterations per hash, with a unique salt per password", t: "Password storage" },
    { i: KeyRound, n: 256, s: "-bit", l: "AES-GCM encryption for every integration secret and OAuth token", t: "Secrets at rest" },
    { i: Lock, n: 5, s: "", l: "failed sign-ins per 15 minutes before an email or IP is locked", t: "Brute-force guard" },
    { i: ShieldCheck, n: 100, s: "%", l: "of reads and writes checked for workspace and permission on the server", t: "Authorization" },
    { i: BadgeCheck, n: 3, s: "", l: "webhook signature schemes verified: Twilio, Stripe, Telegram", t: "Webhook authenticity" },
    { i: ScrollText, n: 0, s: "", l: "ways to edit or delete audit history — blocked by a database trigger", t: "Tamper resistance" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="Security" title="Built like it holds" accent="other people's customers." />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, i) => (
          <motion.div key={t.t} initial={{ opacity: 0, scale: 0.85, rotate: i % 2 ? 3 : -3 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }} viewport={{ once: true, margin: "-10%" }}
            transition={{ type: "spring", stiffness: 160, damping: 18, delay: (i % 3) * 0.1 }} className="edge rounded-3xl p-6">
            <div className="flex items-center justify-between"><t.i className="size-5 text-accent-text" /><span className="text-xs text-muted-foreground">{t.t}</span></div>
            <p className="mt-5 font-display text-6xl tabular"><CountUp to={t.n} suffix={t.s} /></p>
            <p className="mt-2 text-sm text-muted-foreground">{t.l}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================================================================ 6. FAQ — spring accordion */
const FAQS = [
  ["What happens if nobody acknowledges a lead?", "When the window expires the lead moves to the next available employee, then the designated backup, then the manager. Each new owner gets a Telegram alert, and the lead appears in the recovery queue if it escalates twice."],
  ["Does a server restart lose the timers?", "No. Deadlines are stored on the lead in Postgres and a worker claims expired ones with row locks, so a restart resumes exactly where it stopped — and two workers can never escalate the same lead twice."],
  ["Can each company shape its own CRM?", "Yes. Admins add text, number, date, dropdown and checkbox fields, give each pipeline its own field set, rename and reorder stages, and mark fields as required before a stage."],
  ["Are the integrations real?", "Yes — Twilio's WhatsApp sandbox, Stripe in test mode, Google Calendar over OAuth and a Telegram bot. Every webhook is signature-verified and every call is recorded in the sync history."],
  ["Who can see deal values?", "Only roles with the “See opportunity values” permission. Everyone else sees them masked in lists, detail pages, exports, activity history and the dashboard."],
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHead eyebrow="Questions" title="Things teams ask" accent="before switching." />
      <div className="mt-12 divide-y divide-hairline rounded-3xl border border-hairline bg-background/50 backdrop-blur-xl">
        {FAQS.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-lg font-medium">
              {q}
              <motion.span animate={{ rotate: open === i ? 45 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}><Plus className="size-5 text-accent-text" /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden">
                  <p className="px-6 pb-6 text-muted-foreground">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}


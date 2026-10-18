import { Globe, MessageCircle, MessageSquare, PenLine } from "lucide-react";

/* Server-safe presentational pieces (no hooks, no client directive). */

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

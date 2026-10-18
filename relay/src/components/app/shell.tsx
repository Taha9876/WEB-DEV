"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Activity, AlarmClock, Building2, Mail, CalendarDays, ChevronsUpDown, Contact2, Columns3, Inbox, LayoutDashboard, LogOut,
  Menu, Plug, ScrollText, Settings2, ShieldCheck, SlidersHorizontal, Users, Zap,
} from "lucide-react";
import { Logo } from "@/components/landing/landing";
import { Aurora } from "@/components/aurora";
import { Smoke } from "@/components/smoke";
import { Assistant } from "@/components/assistant/assistant";
import { ThemeToggle } from "@/components/theme";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { logout } from "@/app/(auth)/actions";
import { setAvailabilityAction } from "@/app/(app)/_actions/team";
import { StatusDot, STATUS_LABEL, type Status } from "./status";

type Me = { id: string; name: string; email: string; status: Status; role: string };
type Item = { href: string; label: string; icon: React.ElementType; perm?: string };

const NAV: { title?: string; items: Item[] }[] = [
  { items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/leads", label: "Leads", icon: Zap },
    { href: "/recovery", label: "Recovery queue", icon: AlarmClock },
    { href: "/inbox", label: "Inbox", icon: Inbox, perm: "crm.view" },
  ] },
  { title: "CRM", items: [
    { href: "/contacts", label: "Contacts", icon: Contact2, perm: "crm.view" },
    { href: "/companies", label: "Companies", icon: Building2, perm: "crm.view" },
    { href: "/pipeline", label: "Pipeline", icon: Columns3, perm: "crm.view" },
    { href: "/appointments", label: "Appointments", icon: CalendarDays, perm: "crm.view" },
  ] },
  { title: "Workspace", items: [
    { href: "/settings/team", label: "Team", icon: Users },
    { href: "/settings/roles", label: "Roles & permissions", icon: ShieldCheck, perm: "users.manage" },
    { href: "/settings/pipelines", label: "Pipelines & fields", icon: SlidersHorizontal, perm: "config.manage" },
    { href: "/settings/rules", label: "Assignment rules", icon: Settings2, perm: "leads.rules" },
    { href: "/settings/integrations", label: "Integrations", icon: Plug },
    { href: "/settings/reports", label: "Email reports", icon: Mail },
    { href: "/audit", label: "Audit log", icon: ScrollText, perm: "audit.view" },
  ] },
];

export function AppShell({ me, workspace, perms, children }: { me: Me; workspace: string; perms: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const nav = <SideNav perms={perms} onNavigate={() => setOpen(false)} />;
  return (
    <div className="flex h-dvh overflow-hidden">
      {/* The same cursor light as the landing page, dimmed so data stays the focus. */}
      <Aurora intensity={0.78} darkIntensity={0.5} />
      <Smoke />
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-2xl lg:flex">
        <WorkspaceHeader workspace={workspace} />
        {nav}
        <UserCard me={me} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-background p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <WorkspaceHeader workspace={workspace} />
          {nav}
          <UserCard me={me} />
        </SheetContent>
      </Sheet>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-background/80 px-4 backdrop-blur-xl lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg hover:bg-accent"><Menu className="size-5" /></button>
          <Logo className="size-5" /><span className="flex-1 font-medium">{workspace}</span><ThemeToggle className="size-8" />
        </header>
        {/* The workspace sits inside the same device frame as the hero foldable. */}
        <div className="min-h-0 flex-1 p-1.5 lg:p-3 lg:pl-1.5">
          <div className="device-frame h-full">
            <div className="device-bezel">
              <main id="app-screen" className="device-screen relative overflow-y-auto overscroll-contain">{children}</main>
            </div>
          </div>
        </div>
      </div>
      <Assistant firstName={me.name.split(" ")[0]} />
    </div>
  );
}

function WorkspaceHeader({ workspace }: { workspace: string }) {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
      <Logo />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{workspace}</p>
        <p className="text-[11px] text-muted-foreground">Relay workspace</p>
      </div>
      <ThemeToggle className="size-8" />
    </div>
  );
}

function SideNav({ perms, onNavigate }: { perms: string[]; onNavigate: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="App">
      {NAV.map((g, gi) => {
        const items = g.items.filter((i) => !i.perm || perms.includes(i.perm));
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.title && <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{g.title}</p>}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + "/");
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"}`}>
                      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-sidebar-accent shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <i.icon className={`relative size-4 ${active ? "text-signal" : ""}`} aria-hidden />
                      <span className="relative">{i.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserCard({ me }: { me: Me }) {
  const [status, setStatus] = useState<Status>(me.status);
  const [pending, start] = useTransition();
  const change = (s: Status) => {
    const prev = status;
    setStatus(s);
    start(async () => {
      const r = await setAvailabilityAction(me.id, s);
      if (!r.ok) { setStatus(prev); toast.error(r.error); return; }
      const moved = (r.data as { moved: number } | undefined)?.moved ?? 0;
      toast.success(`You are now ${STATUS_LABEL[s]}`, { description: moved ? `${moved} unacknowledged lead(s) were reassigned.` : undefined });
    });
  };
  return (
    <div className="border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring">
          <div className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-signal/30 to-chart-2/30 text-xs font-medium">
            {me.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-sidebar" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-muted-foreground">{pending ? "Updating…" : `${STATUS_LABEL[status]} · ${me.role}`}</p>
          </div>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Availability</DropdownMenuLabel>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <DropdownMenuItem key={s} onSelect={() => change(s)} className="gap-2.5">
              <StatusDot status={s} /> {STATUS_LABEL[s]}
              {s === status && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="gap-2.5"><Link href="/settings/profile"><Activity className="size-4" /> Profile & alerts</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => logout()} className="gap-2.5 text-destructive focus:text-destructive"><LogOut className="size-4" /> Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Copy, Crown, Loader2, MailPlus, ShieldCheck } from "lucide-react";
import { PageHeader, Avatar } from "@/components/app/primitives";
import { StatusDot, STATUS_LABEL, type Status } from "@/components/app/status";
import { inviteAction, setActiveAction, updateMemberAction } from "@/app/(app)/_actions/admin";
import { setAvailabilityAction } from "@/app/(app)/_actions/team";

type M = { id: string; name: string; email: string; level: "owner" | "admin" | "user"; roleId: string | null; roleName: string | null; status: Status; timezone: string; deactivatedAt: string | null; telegram: string | null; openLeads: number };

export function TeamView({ team, roles, invites, me, can }: {
  team: M[]; roles: { id: string; name: string }[]; invites: { id: string; email: string; level: string; expiresAt: string }[];
  me: { id: string; level: string }; can: { users: boolean; availability: boolean };
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const router = useRouter();
  const act = (p: Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: string) => start(async () => {
    const r = await p; if (!r.ok) { toast.error(r.error); return; } toast.success(ok); router.refresh();
  });
  const sendInvite = (f: FormData) => start(async () => {
    const r = await inviteAction(String(f.get("email")), String(f.get("level")), String(f.get("roleId") ?? ""));
    if (!r.ok) { toast.error(r.error); return; }
    setLink((r.data as { link: string }).link); router.refresh();
  });
  const available = team.filter((t) => t.status === "available" && !t.deactivatedAt).length;

  return (
    <div className="pb-16">
      <PageHeader title="Team" description={`${available} of ${team.filter((t) => !t.deactivatedAt).length} people available for new leads right now.`} />
      {can.users && (
        <form action={sendInvite} className="flex flex-wrap items-end gap-2 border-b border-hairline bg-surface/40 px-4 py-4 sm:px-8">
          <div className="min-w-56 flex-1"><label htmlFor="inv-email" className="mb-1 block text-xs">Invite by email</label>
            <input id="inv-email" name="email" type="email" required placeholder="teammate@company.com" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-signal/60" /></div>
          <div><label htmlFor="inv-level" className="mb-1 block text-xs">Level</label>
            <select id="inv-level" name="level" className="h-9 rounded-lg border border-input bg-background px-2 text-sm"><option value="user">User</option><option value="admin">Admin</option></select></div>
          <div><label htmlFor="inv-role" className="mb-1 block text-xs">Role</label>
            <select id="inv-role" name="roleId" className="h-9 rounded-lg border border-input bg-background px-2 text-sm">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <button disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-sm font-medium text-signal-foreground disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />} Create invite</button>
          {link && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-xs">
              <span className="text-signal">Share this link:</span><code className="flex-1 truncate">{link}</code>
              <button type="button" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }} aria-label="Copy invite link"><Copy className="size-3.5" /></button>
            </div>
          )}
          {invites.length > 0 && <p className="w-full text-xs text-muted-foreground">Pending: {invites.map((i) => `${i.email} (${i.level})`).join(", ")}</p>}
        </form>
      )}

      <ul className="divide-y divide-hairline">
        {team.map((m, i) => {
          const editable = can.users && !(m.level === "owner" && me.level !== "owner") && m.id !== me.id;
          return (
            <motion.li key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-8 ${m.deactivatedAt ? "opacity-50" : ""}`}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative"><Avatar name={m.name} className="size-10 text-xs" /><StatusDot status={m.status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" /></div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">{m.name}{m.id === me.id && <span className="text-xs text-muted-foreground">(you)</span>}
                    {m.level === "owner" && <Crown className="size-3.5 text-warn" aria-label="Owner" />}{m.level === "admin" && <ShieldCheck className="size-3.5 text-chart-2" aria-label="Admin" />}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email} · {m.timezone} · {m.openLeads} open lead{m.openLeads === 1 ? "" : "s"}{m.deactivatedAt ? " · deactivated" : ""}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`Availability of ${m.name}`} value={m.status} disabled={pending || !!m.deactivatedAt || !(m.id === me.id || can.availability) || (m.level === "owner" && me.level !== "owner" && m.id !== me.id)}
                  onChange={(e) => act(setAvailabilityAction(m.id, e.target.value), `${m.name} is now ${STATUS_LABEL[e.target.value as Status]}`)}
                  className="h-8 rounded-lg border border-input bg-surface px-2 text-xs disabled:opacity-60">
                  {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                {m.level === "owner" ? <span className="h-8 rounded-lg border border-hairline px-3 text-xs leading-8 text-muted-foreground">Owner · all permissions</span> : <>
                  <select aria-label={`Level of ${m.name}`} value={m.level} disabled={!editable || pending} onChange={(e) => act(updateMemberAction(m.id, { level: e.target.value }), "Level updated")}
                    className="h-8 rounded-lg border border-input bg-surface px-2 text-xs disabled:opacity-60"><option value="admin">Admin</option><option value="user">User</option></select>
                  <select aria-label={`Role of ${m.name}`} value={m.roleId ?? ""} disabled={!editable || pending} onChange={(e) => act(updateMemberAction(m.id, { roleId: e.target.value || null }), "Role updated")}
                    className="h-8 rounded-lg border border-input bg-surface px-2 text-xs disabled:opacity-60"><option value="">No role</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                </>}
                {editable && m.level !== "owner" && (
                  <button disabled={pending} onClick={() => confirm(m.deactivatedAt ? `Reactivate ${m.name}?` : `Deactivate ${m.name}? They'll be signed out and their open leads reassigned.`) && act(setActiveAction(m.id, !!m.deactivatedAt), m.deactivatedAt ? "Reactivated" : "Deactivated — leads reassigned")}
                    className={`h-8 rounded-lg px-3 text-xs ${m.deactivatedAt ? "border border-input hover:bg-accent" : "text-destructive hover:bg-destructive/10"}`}>{m.deactivatedAt ? "Reactivate" : "Deactivate"}</button>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/primitives";
import { deleteRoleAction, saveRoleAction } from "@/app/(app)/_actions/admin";

type Role = { id: string; name: string; permissions: string[] };
const GROUPS: [string, string[]][] = [
  ["CRM records", ["crm.view", "crm.view_all", "crm.create", "crm.edit", "crm.delete", "crm.export", "crm.view_value"]],
  ["Leads", ["leads.rules", "leads.manage"]],
  ["Workspace", ["config.manage", "integrations.manage", "audit.view", "users.manage"]],
];

/** F1.3 — a permission matrix. "Manager" is just a role whose boxes are ticked differently. */
export function RolesView({ roles, catalog, mine }: { roles: Role[]; catalog: Record<string, string>; mine: string[] }) {
  const [draft, setDraft] = useState<Record<string, Set<string>>>(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])));
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(roles.map((r) => [r.id, r.name])));
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = (r: Role) => names[r.id] !== r.name || draft[r.id].size !== r.permissions.length || r.permissions.some((p) => !draft[r.id].has(p));
  const toggle = (rid: string, p: string) => setDraft((d) => { const s = new Set(d[rid]); if (s.has(p)) s.delete(p); else s.add(p); return { ...d, [rid]: s }; });
  const save = (r: Role) => start(async () => { const res = await saveRoleAction(r.id, names[r.id], [...draft[r.id]]); res.ok ? (toast.success(`Saved ${names[r.id]}`), router.refresh()) : toast.error(res.error); });
  const create = () => { const n = prompt("Role name (e.g. Support, Team lead)"); if (!n) return; start(async () => { const r = await saveRoleAction(null, n, ["crm.view"]); r.ok ? (toast.success("Role created"), location.reload()) : toast.error(r.error); }); };
  const remove = (r: Role) => confirm(`Delete role "${r.name}"?`) && start(async () => { const res = await deleteRoleAction(r.id); res.ok ? (toast.success("Deleted"), location.reload()) : toast.error(res.error); });

  return (
    <div className="pb-16">
      <PageHeader title={<>Roles &amp; <em>permissions</em></>} description="Roles are named bundles of permissions. Every check happens on the server — hiding a button is never the protection. The Owner always has everything.">
        <button onClick={create} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-sm font-medium text-signal-foreground"><Plus className="size-4" /> New role</button>
      </PageHeader>
      <div className="overflow-x-auto px-4 py-6 sm:px-8">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left text-xs font-normal text-muted-foreground">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="px-3 py-2 text-center align-bottom font-normal">
                  <input aria-label={`Role name ${r.name}`} value={names[r.id]} onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
                    className="w-28 rounded-md bg-transparent px-1 text-center text-sm font-medium outline-none focus:bg-surface" />
                  <div className="mt-1 flex justify-center gap-1">
                    {dirty(r) && <button onClick={() => save(r)} disabled={pending} className="inline-flex h-6 items-center gap-1 rounded-md bg-signal px-2 text-[11px] font-medium text-signal-foreground">{pending && <Loader2 className="size-3 animate-spin" />}Save</button>}
                    <button onClick={() => remove(r)} aria-label={`Delete ${r.name}`} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(([g, perms]) => (
              <Fragment key={g}>
                <tr><td colSpan={roles.length + 1} className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{g}</td></tr>
                {perms.map((p) => (
                  <tr key={p} className="group">
                    <td className="sticky left-0 z-10 border-b border-hairline bg-background px-3 py-2.5 group-hover:bg-surface">
                      <span className="block">{catalog[p]}</span><code className="text-[11px] text-muted-foreground">{p}</code></td>
                    {roles.map((r) => {
                      const locked = !mine.includes(p) && !r.permissions.includes(p);
                      return (
                        <td key={r.id} className="border-b border-hairline px-3 py-2.5 text-center group-hover:bg-surface">
                          <input type="checkbox" checked={draft[r.id].has(p)} disabled={locked} onChange={() => toggle(r.id, p)}
                            aria-label={`${catalog[p]} for ${r.name}`} title={locked ? "You can't grant a permission you don't have" : undefined}
                            className="size-4 cursor-pointer accent-[var(--signal)] disabled:cursor-not-allowed" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

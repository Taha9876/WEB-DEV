import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { AppShell } from "@/components/app/shell";
import { RealtimeProvider } from "@/components/app/realtime";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return (
    <RealtimeProvider userId={ctx.userId}>
      <AppShell
        me={{ id: ctx.userId, name: ctx.user.name, email: ctx.user.email, status: ctx.user.status, role: ctx.roleName ?? "Member" }}
        workspace={ctx.workspaceName}
        perms={[...ctx.perms]}
      >
        {children}
      </AppShell>
    </RealtimeProvider>
  );
}

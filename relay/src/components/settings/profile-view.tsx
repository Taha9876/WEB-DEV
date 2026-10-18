"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, ExternalLink, Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/app/primitives";
import { setTelegramChatAction } from "@/app/(app)/_actions/integrations";
import { disconnectCalendarAction } from "@/app/(app)/_actions/appointments";

const FLASH: Record<string, [string, "success" | "error"]> = {
  connected: ["Google Calendar connected.", "success"], denied: ["You declined Google's consent screen — nothing was connected.", "error"],
  state_mismatch: ["That sign-in link expired. Please try connecting again.", "error"], not_configured: ["Google OAuth isn't configured on the server yet (GOOGLE_CLIENT_ID / SECRET).", "error"],
};

export function ProfileView({ name, email, timezone, telegram, calendar, flash }: {
  name: string; email: string; timezone: string;
  telegram: { connected: boolean; chatId: string; bot: string | null; deepLink: string | null };
  calendar: { configured: boolean; status: string | null; email: string | null; lastError: string | null };
  flash: { kind: string; reason?: string } | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!flash) return;
    const [msg, kind] = FLASH[flash.kind] ?? [flash.reason ?? "Couldn't connect Google Calendar.", "error"];
    toast[kind](msg);
    router.replace("/settings/profile");
  }, [flash, router]);

  return (
    <div className="pb-16">
      <PageHeader title="Profile & alerts" description={`${name} · ${email} · ${timezone}`} />
      <div className="grid max-w-5xl gap-4 px-4 pt-6 sm:px-8 lg:grid-cols-2">
        <section className="edge rounded-3xl p-6" aria-labelledby="cal-h">
          <h2 id="cal-h" className="flex items-center gap-2 font-medium"><CalendarDays className="size-5 text-signal" /> Google Calendar</h2>
          <p className="mt-2 text-sm text-muted-foreground">Connect your own calendar so teammates can book appointments with you. Relay only reads busy times and manages the events it creates.</p>
          <div className="mt-5">
            {!calendar.configured ? <p className="text-sm text-ember">The server has no Google OAuth client configured yet.</p>
              : calendar.status === "connected" ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="size-4" /> Connected as {calendar.email}</span>
                  <button disabled={pending} onClick={() => start(async () => { const r = await disconnectCalendarAction(); r.ok ? (toast.success("Disconnected"), router.refresh()) : toast.error(r.error); })}
                    className="h-9 rounded-lg border border-input px-3 text-sm text-destructive hover:bg-destructive/10">Disconnect</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {calendar.status === "needs_reconnect" && <p role="alert" className="rounded-xl border border-ember/30 bg-ember/10 p-3 text-sm text-ember">Your connection expired or was revoked ({calendar.lastError}). Reconnect to be bookable again.</p>}
                  <a href="/api/integrations/google/connect" className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background">
                    <CalendarDays className="size-4" /> {calendar.status === "needs_reconnect" ? "Reconnect" : "Connect"} Google Calendar</a>
                </div>
              )}
          </div>
        </section>

        <section className="edge rounded-3xl p-6" aria-labelledby="tg-h">
          <h2 id="tg-h" className="flex items-center gap-2 font-medium"><Send className="size-5 text-signal" /> Telegram escalation alerts</h2>
          <p className="mt-2 text-sm text-muted-foreground">When a lead is escalated to you, you get a Telegram message within the minute with the lead, source, reason and a link.</p>
          <div className="mt-5 space-y-4">
            {telegram.connected && <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="size-4" /> Alerts go to chat {telegram.chatId}</p>}
            {telegram.deepLink ? (
              <a href={telegram.deepLink} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background">
                <ExternalLink className="size-4" /> {telegram.connected ? "Re-link" : "Connect"} with @{telegram.bot}</a>
            ) : <p className="text-sm text-muted-foreground">An Admin needs to connect the Telegram bot on the Integrations page first.</p>}
            <form action={(f) => start(async () => { const r = await setTelegramChatAction(String(f.get("chatId") ?? "")); r.ok ? (toast.success("Saved"), router.refresh()) : toast.error(r.error); })}
              className="space-y-1.5">
              <label htmlFor="chat" className="block text-xs text-muted-foreground">Or enter your chat ID manually (message @userinfobot to get it)</label>
              <div className="flex gap-2">
                <input id="chat" name="chatId" defaultValue={telegram.chatId} inputMode="numeric" placeholder="123456789" className="h-9 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:border-signal/60" />
                <button disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-accent">{pending && <Loader2 className="size-3.5 animate-spin" />}Save</button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

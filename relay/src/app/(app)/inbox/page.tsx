import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireCtx } from "@/server/context";
import { inbox } from "@/server/domain/messaging";
import { getContactView } from "@/server/domain/crm";
import { ConversationPanel } from "@/components/inbox/conversation-panel";
import { Avatar, EmptyState } from "@/components/app/static";
import { relative } from "@/lib/format";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const list = [...(await inbox(ctx))];
  const activeId = sp.c ?? list[0]?.contact_id;
  const active = activeId ? await getContactView(ctx, activeId).catch(() => null) : null;
  const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x));

  return (
    <div className="grid h-full lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={`flex-col border-r border-hairline ${sp.c ? "hidden lg:flex" : "flex"}`}>
        <header className="border-b border-hairline px-5 pb-4 pt-8"><h1 className="font-display text-4xl">Inbox</h1>
          <p className="mt-1 text-xs text-muted-foreground">{ctx.can("crm.view_all") ? "All WhatsApp conversations" : "Conversations with your contacts"}</p></header>
        <ul className="flex-1 overflow-y-auto" aria-label="Conversations">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox?c=${c.contact_id}`} aria-current={c.contact_id === activeId ? "true" : undefined}
                className={`flex gap-3 border-b border-hairline px-5 py-3.5 transition-colors ${c.contact_id === activeId ? "bg-surface" : "hover:bg-surface/50"}`}>
                <Avatar name={c.name} className="size-9 text-[11px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-medium">{c.name}</span>
                    {c.last_message_at && <span className="shrink-0 text-[11px] text-muted-foreground">{relative(c.last_message_at)}</span>}</div>
                  <p className="truncate text-xs text-muted-foreground">{c.last_dir === "outbound" ? "You: " : ""}{c.last_body ?? "—"}</p>
                  {c.owner_name && <p className="mt-0.5 text-[10px] text-muted-foreground/70">Owner · {c.owner_name}</p>}
                </div>
              </Link>
            </li>
          ))}
          {!list.length && <li className="px-5 py-10 text-center text-sm text-muted-foreground">No conversations yet. Messages to your WhatsApp sandbox number appear here instantly.</li>}
        </ul>
      </aside>
      <section className={`min-w-0 flex-col p-4 sm:p-6 ${sp.c ? "flex" : "hidden lg:flex"}`}>
        {active ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/inbox" className="text-sm text-muted-foreground lg:hidden">← Back</Link>
                <Link href={`/contacts/${active.contact.id}`} className="text-xl font-medium hover:underline hover:underline-offset-4">{active.contact.firstName} {active.contact.lastName}</Link>
              </div>
              <span className="text-xs text-muted-foreground">Assigned to {active.owner?.name ?? "nobody"}</span>
            </div>
            <ConversationPanel compact contactId={active.contact.id} optedOut={active.contact.optedOut} hasPhone={!!active.contact.phone} hasTelegram={!!active.contact.telegramChatId} conversations={ser(active.conversations)} />
          </>
        ) : <EmptyState icon={Inbox} title="Pick a conversation" body="Select a thread on the left." />}
      </section>
    </div>
  );
}

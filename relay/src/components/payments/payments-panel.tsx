"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, CreditCard, ExternalLink, Loader2, Send } from "lucide-react";
import { Section, Empty } from "@/components/crm/contact-detail";
import { requestPaymentAction, sendPaymentLinkAction } from "@/app/(app)/_actions/payments";
import { money, relative } from "@/lib/format";

type Pay = { id: string; amountCents: number | null; currency: string; status: string; refundedCents: number | null; url: string | null; paidAt: string | null; createdAt: string; opportunityId: string; requestedBy: string | null; reference: string | null; sessionId: string | null };
type Opp = { id: string; title: string; valueCents: number | null; currency: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting payment", cls: "bg-warn/15 text-warn" }, paid: { label: "Paid", cls: "bg-ok/15 text-ok" },
  failed: { label: "Failed attempt", cls: "bg-destructive/15 text-destructive" }, expired: { label: "Expired · abandoned", cls: "bg-muted text-muted-foreground" },
  canceled: { label: "Not created", cls: "bg-muted text-muted-foreground" }, refunded: { label: "Refunded", cls: "bg-leave/15 text-leave" },
  partially_refunded: { label: "Partly refunded", cls: "bg-leave/15 text-leave" },
};

/** I2: request → link → webhook flips status live. Shows who requested it and the provider reference (I2.7). */
export function PaymentsPanel({ contactId, payments, opportunities, canValue, openFor }: { contactId: string; payments: Pay[]; opportunities: Opp[]; canValue: boolean; openFor?: string }) {
  const [open, setOpen] = useState(!!openFor);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [oppId, setOppId] = useState(openFor ?? opportunities[0]?.id ?? "");
  const opp = opportunities.find((o) => o.id === oppId);
  useEffect(() => { if (openFor) setOpen(true); }, [openFor]);

  const submit = (f: FormData) => start(async () => {
    const r = await requestPaymentAction({ opportunityId: oppId, amount: f.get("amount"), currency: f.get("currency"), description: f.get("description") || undefined });
    if (!r.ok) { toast.error(r.error); return; }
    setOpen(false); toast.success("Payment link created", { description: "Status updates automatically when the customer pays." }); router.refresh();
  });
  const send = (p: Pay) => start(async () => {
    const r = await sendPaymentLinkAction(contactId, p.url!, money(p.amountCents, p.currency.toUpperCase()));
    r.ok ? (toast.success("Link sent on WhatsApp"), router.refresh()) : toast.error(r.error);
  });

  return (
    <Section title="Payments" icon={CreditCard} action={canValue && opportunities.length > 0 && !open ? <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground">+ Request</button> : null}>
      {open && (
        <form action={submit} className="mx-2 mb-2 space-y-2 rounded-xl border border-hairline bg-background/60 p-3">
          <label htmlFor="pay-opp" className="block text-xs">Opportunity</label>
          <select id="pay-opp" value={oppId} onChange={(e) => setOppId(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">
            {opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div><label htmlFor="pay-amt" className="mb-1 block text-xs">Amount</label>
              <input id="pay-amt" name="amount" type="number" min="0.5" step="0.01" required key={oppId} defaultValue={opp?.valueCents ? (opp.valueCents / 100).toFixed(2) : ""} className="h-9 w-full rounded-lg border border-input bg-surface px-3 font-mono text-sm" /></div>
            <div><label htmlFor="pay-cur" className="mb-1 block text-xs">Currency</label>
              <select id="pay-cur" name="currency" defaultValue={(opp?.currency ?? "usd").toLowerCase()} className="h-9 w-full rounded-lg border border-input bg-surface px-2 text-sm">
                {["usd", "eur", "gbp", "pkr", "aed"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></div>
          </div>
          <input name="description" aria-label="Description" placeholder="Description (optional)" className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm" />
          <p className="text-[11px] text-muted-foreground">Card details are entered only on Stripe&apos;s hosted page. Test card 4242 4242 4242 4242.</p>
          <div className="flex gap-2">
            <button disabled={pending} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-signal text-xs font-medium text-signal-foreground disabled:opacity-60">{pending && <Loader2 className="size-3 animate-spin" />}Create link</button>
            <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg border border-input px-3 text-xs">Cancel</button>
          </div>
        </form>
      )}
      {payments.length ? payments.map((p) => {
        const s = STATUS[p.status] ?? STATUS.pending;
        return (
          <div key={p.id} className="rounded-xl px-3 py-2.5 hover:bg-accent/50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm tabular">{money(p.amountCents, p.currency.toUpperCase())}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {opportunities.find((o) => o.id === p.opportunityId)?.title ?? "Opportunity"} · by {p.requestedBy ?? "—"} · {relative(p.createdAt)}
              {p.refundedCents ? ` · refunded ${money(p.refundedCents, p.currency.toUpperCase())}` : ""}
            </p>
            {(p.reference || p.sessionId) && <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70" title="Stripe reference">{p.reference ?? p.sessionId}</p>}
            {p.status === "pending" && p.url && (
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => send(p)} disabled={pending} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 text-[11px] hover:bg-accent"><Send className="size-3" /> WhatsApp</button>
                <button onClick={() => { navigator.clipboard.writeText(p.url!); toast.success("Link copied"); }} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 text-[11px] hover:bg-accent"><Copy className="size-3" /> Copy</button>
                <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 text-[11px] hover:bg-accent"><ExternalLink className="size-3" /> Open</a>
              </div>
            )}
          </div>
        );
      }) : !open && <Empty>{opportunities.length ? "No payment requests yet." : "Create an opportunity to request a payment."}</Empty>}
    </Section>
  );
}

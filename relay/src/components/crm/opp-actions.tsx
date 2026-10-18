"use client";

import Link from "next/link";
import { CalendarPlus, CreditCard } from "lucide-react";

/** Entry points to payments (I2) and appointments (I3) from an opportunity. */
export function OppActions({ opportunityId, contactId }: { opportunityId: string; contactId: string }) {
  return (
    <div className="mx-4 mb-4 grid grid-cols-2 gap-2 border-t border-hairline pt-4">
      <Link href={`/contacts/${contactId}?pay=${opportunityId}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input text-sm hover:bg-accent"><CreditCard className="size-4" /> Request payment</Link>
      <Link href={`/contacts/${contactId}?book=${opportunityId}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input text-sm hover:bg-accent"><CalendarPlus className="size-4" /> Book</Link>
    </div>
  );
}

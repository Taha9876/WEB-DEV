"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { createPaymentRequest } from "@/server/domain/payments";
import { sendMessage } from "@/server/domain/messaging";

export async function requestPaymentAction(input: unknown) {
  return run(async () => {
    const d = z.object({
      opportunityId: z.string().uuid("Choose an opportunity"),
      amount: z.coerce.number().positive("Enter an amount").max(999_999),
      currency: z.enum(["usd", "eur", "gbp", "pkr", "aed"]),
      description: z.string().trim().max(120).optional(),
    }).parse(input);
    const p = await createPaymentRequest(await requireCtx(), d.opportunityId, Math.round(d.amount * 100), d.currency, d.description);
    revalidatePath(`/contacts/${p.contactId}`);
    return { id: p.id, url: p.url };
  });
}

export async function sendPaymentLinkAction(contactId: string, url: string, amountLabel: string) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!/^https:\/\/checkout\.stripe\.com\//.test(url)) throw new Error("Not a Stripe checkout link");
    await sendMessage(ctx, z.string().uuid().parse(contactId), `Here is your secure payment link for ${amountLabel}: ${url}`);
  });
}

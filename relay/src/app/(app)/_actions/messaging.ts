"use server";

import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { retryMessage, sendMessage } from "@/server/domain/messaging";

export async function sendMessageAction(contactId: string, body: string, ai = false) {
  return run(async () => {
    const text = z.string().trim().min(1, "Type a message first").max(1600, "WhatsApp messages are limited to 1600 characters").parse(body);
    const m = await sendMessage(await requireCtx(), z.string().uuid().parse(contactId), text, { ai });
    return { id: m.id };
  });
}

export async function retryMessageAction(messageId: string) {
  return run(async () => retryMessage(await requireCtx(), z.string().uuid().parse(messageId)));
}

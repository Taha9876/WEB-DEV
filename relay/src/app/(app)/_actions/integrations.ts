"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { connect, disconnectProvider } from "@/server/domain/integrations-admin";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";

export async function connectAction(provider: string, input: Record<string, string>) {
  return run(async () => {
    await connect(await requireCtx(), z.enum(["twilio", "stripe", "telegram"]).parse(provider), z.record(z.string(), z.string().max(500)).parse(input));
    revalidatePath("/settings/integrations");
  });
}

export async function disconnectAction(provider: string) {
  return run(async () => {
    await disconnectProvider(await requireCtx(), z.enum(["twilio", "stripe", "telegram", "google"]).parse(provider));
    revalidatePath("/settings/integrations");
  });
}

/** I4.3 — each employee sets their own destination (manual chat ID fallback to the deep-link). */
export async function setTelegramChatAction(chatId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    const v = z.string().trim().regex(/^-?\d{4,20}$/, "A Telegram chat ID is a number, e.g. 123456789").or(z.literal("")).parse(chatId);
    await db.update(schema.users).set({ telegramChatId: v || null }).where(eq(schema.users.id, ctx.userId));
    revalidatePath("/settings/profile");
  });
}

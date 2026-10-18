"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { AppError } from "@/server/errors";
import { saveSchedule, sendReportNow } from "@/server/domain/reports";

const list = (s: string) => s.split(/[,\s;]+/).filter(Boolean);

export async function sendReportNowAction(recipients: string) {
  return run(async () => {
    try { return await sendReportNow(await requireCtx(), list(z.string().max(1000).parse(recipients))); }
    catch (e) { if (e instanceof AppError) throw e; throw new AppError(502, "email_failed", e instanceof Error ? e.message : "Email failed."); }
    finally { revalidatePath("/settings/reports"); }
  });
}

export async function saveScheduleAction(input: { recipients: string; hour: number; timezone: string; enabled: boolean }) {
  return run(async () => {
    const d = z.object({ recipients: z.string().max(1000), hour: z.coerce.number().int(), timezone: z.string().max(60), enabled: z.boolean() }).parse(input);
    await saveSchedule(await requireCtx(), { ...d, recipients: list(d.recipients) });
    revalidatePath("/settings/reports");
  });
}

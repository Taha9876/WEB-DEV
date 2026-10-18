"use server";

import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { AppError } from "@/server/errors";
import { AiUnavailable } from "@/server/ai";
import { draftReplyFor, filtersFromText } from "@/server/domain/ai-features";

const ai = async <T>(fn: () => Promise<T>) => {
  try { return await fn(); } catch (e) { if (e instanceof AiUnavailable) throw new AppError(503, "ai_unavailable", e.message); throw e; }
};

export async function draftReplyAction(contactId: string) {
  return run(async () => ({ text: await ai(async () => draftReplyFor(await requireCtx(), z.string().uuid().parse(contactId))) }));
}

export async function aiFiltersAction(query: string) {
  return run(async () => ai(async () => filtersFromText(await requireCtx(), z.string().trim().min(3, "Describe the list you want").max(300).parse(query))));
}

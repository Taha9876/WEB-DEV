"use server";

import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { setAvailability } from "@/server/domain/team";

const statusSchema = z.enum(["available", "busy", "on_leave", "offline"]);

export async function setAvailabilityAction(userId: string, status: string) {
  return run(async () => setAvailability(await requireCtx(), z.string().uuid().parse(userId), statusSchema.parse(status)));
}

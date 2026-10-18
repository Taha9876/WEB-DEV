"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { run } from "@/server/action";
import { updateRules } from "@/server/domain/leads";

const secs = (label: string) => z.coerce.number().int().min(5, `${label}: at least 5 seconds`).max(7 * 86400, `${label}: at most 7 days`);

export async function updateRulesAction(input: unknown) {
  return run(async () => {
    const d = z.object({
      maxOpenLeads: z.coerce.number().int().min(1, "At least 1").max(500),
      ackWindowSeconds: secs("Acknowledgement window"),
      idleSeconds: secs("Idle period"),
      acknowledgedOnAbsence: z.enum(["keep", "reassign"]),
      aiFirstResponse: z.boolean(),
      escalationChain: z.array(z.object({ type: z.enum(["next_eligible", "backup", "manager"]), seconds: secs("Level time"), userId: z.string().uuid().optional() })).max(6, "At most 6 levels"),
    }).parse(input);
    await updateRules(await requireCtx(), d);
    revalidatePath("/settings/rules");
  });
}

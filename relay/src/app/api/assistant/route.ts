import { z } from "zod";
import { getCtx } from "@/server/context";
import { AppError } from "@/server/errors";
import { ask } from "@/server/domain/assistant";

export const runtime = "nodejs";

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).min(1).max(40),
});

// Per-user throttle so one tab can't burn the free AI quota for the whole workspace.
const hits = new Map<string, number[]>();
const limited = (id: string) => {
  const now = Date.now(), recent = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  recent.push(now); hits.set(id, recent);
  return recent.length > 15;
};

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return Response.json({ error: "Please sign in." }, { status: 401 });
  // Same-origin only (CSRF): browsers send Origin on POST.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return Response.json({ error: "Bad origin" }, { status: 403 });
  if (limited(ctx.userId)) return Response.json({ error: "You're asking very fast — wait a few seconds and try again." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    return Response.json(await ask(ctx, parsed.data.messages));
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[assistant]", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

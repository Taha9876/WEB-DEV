import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { safeEqual } from "@/server/crypto";
import { CalendarError, completeConnection } from "@/server/integrations/google";

export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const url = new URL(req.url);
  const jar = await cookies();
  const [state, userId] = (jar.get("g_oauth_state")?.value ?? "").split(".");
  jar.delete({ name: "g_oauth_state", path: "/api/integrations/google" });
  if (url.searchParams.get("error")) redirect(`/settings/profile?calendar=denied`);
  if (!state || userId !== ctx.userId || !safeEqual(state, url.searchParams.get("state") ?? "")) redirect("/settings/profile?calendar=state_mismatch");
  let to = "/settings/profile?calendar=connected";
  try {
    await completeConnection(ctx.workspaceId, ctx.userId, url.searchParams.get("code") ?? "");
  } catch (e) {
    to = `/settings/profile?calendar=error&reason=${encodeURIComponent(e instanceof CalendarError ? e.message : "Google rejected the connection. Try again.")}`;
  }
  redirect(to);
}

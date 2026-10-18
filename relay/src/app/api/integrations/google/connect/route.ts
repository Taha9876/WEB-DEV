import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { randomToken } from "@/server/crypto";
import { authUrl, googleConfigured } from "@/server/integrations/google";

/** Starts the OAuth consent flow for the signed-in employee's own calendar (I3.1). State is bound to an HttpOnly cookie (CSRF). */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (!googleConfigured()) redirect("/settings/profile?calendar=not_configured");
  const state = randomToken(24);
  (await cookies()).set("g_oauth_state", `${state}.${ctx.userId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/integrations/google", maxAge: 600 });
  redirect(authUrl(state));
}

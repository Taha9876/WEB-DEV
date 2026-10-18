// Free public HTTPS tunnel (no account) with a fixed subdomain, auto-reconnecting.
// Usage: node scripts/tunnel.mjs [subdomain]   → https://<subdomain>.loca.lt  (set APP_URL to it)
import localtunnel from "localtunnel";
const subdomain = process.argv[2] || "relay-team65-demo";
async function open() {
  try {
    const t = await localtunnel({ port: 3000, subdomain });
    console.log(`[tunnel] ${t.url}`);
    t.on("close", () => { console.log("[tunnel] closed — reconnecting"); setTimeout(open, 2000); });
    t.on("error", (e) => { console.log("[tunnel] error:", e.message); try { t.close(); } catch {} });
  } catch (e) {
    console.log("[tunnel] failed:", e.message, "— retrying"); setTimeout(open, 3000);
  }
}
open();

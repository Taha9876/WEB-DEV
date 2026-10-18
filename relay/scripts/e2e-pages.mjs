// Visits every app page as a fresh Owner and reports server errors. Usage: node scripts/e2e-pages.mjs <shot-dir>
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".", base = "http://localhost:3000";
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errs.push(`console ${page.url()}: ${m.text().slice(0, 200)}`); });
const tag = Date.now().toString(36);
await page.goto(`${base}/signup`);
await page.fill("#f-workspaceName", `Demo ${tag}`); await page.fill("#f-name", "Taha Ahmed");
await page.fill("#f-email", `p-${tag}@demo.dev`); await page.fill("#f-password", "password1234");
await page.click("button:has-text('Create workspace')"); await page.waitForURL("**/dashboard", { timeout: 30000 });
const paths = ["/dashboard", "/leads", "/recovery", "/inbox", "/contacts", "/pipeline", "/appointments", "/settings/team", "/settings/roles", "/settings/pipelines", "/settings/rules", "/settings/integrations", "/settings/profile", "/audit"];
for (const p of paths) {
  const r = await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
  const h1 = await page.locator("h1").first().textContent({ timeout: 5000 }).catch(() => "(no h1)");
  console.log(String(r.status()).padEnd(4), p.padEnd(24), h1?.trim().slice(0, 40));
  if (process.argv[3] === "shots") await page.screenshot({ path: `${out}/pg${p.replace(/\//g, "_")}.png` });
}
console.log(errs.length ? errs.slice(0, 10).join("\n") : "no browser errors");
await b.close();

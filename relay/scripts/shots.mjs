// Screenshots of a seeded workspace. Usage: node scripts/shots.mjs <dir> <email> <password> <path | click:LinkName ...>
// On Git Bash prefix with MSYS_NO_PATHCONV=1 so "/path" arguments aren't rewritten.
import { chromium } from "playwright-core";
const [out, email, password, ...paths] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(`${page.url()} ${(e.stack || e.message).split("\n").slice(0, 8).join(" | ")}`));
await page.goto("http://localhost:3000/login");
await page.fill("#f-email", email); await page.fill("#f-password", password);
await page.click("button:has-text('Sign in')"); await page.waitForURL("**/dashboard", { timeout: 30000 });
for (const p of paths) {
  if (p.startsWith("click:")) {
    const u = page.url();
    await page.getByRole("link", { name: p.slice(6) }).first().click();
    await page.waitForURL((x) => x.href !== u, { timeout: 20000 });
    await page.waitForLoadState("networkidle");
  } else await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/s${p.replace(/[^a-z0-9]/gi, "_")}.png` });
  console.log("shot", p);
}
console.log(errs.length ? errs.join("\n") : "no errors");
await b.close();

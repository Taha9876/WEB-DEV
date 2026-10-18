// Browser smoke test using the installed Edge. Usage: node scripts/e2e-smoke.mjs <screenshot-dir>
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".";
const base = process.env.APP_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const step = async (name, fn) => { try { await fn(); console.log("PASS ", name); } catch (e) { console.log("FAIL ", name, "-", e.message.split("\n")[0]); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, "-")}.png` }); } };
const tag = Date.now().toString(36);

await step("signup creates workspace and lands on dashboard", async () => {
  await page.goto(`${base}/signup`);
  await page.fill("#f-workspaceName", `Sunrise Solar ${tag}`);
  await page.fill("#f-name", "Taha Ahmed");
  await page.fill("#f-email", `taha-${tag}@demo.dev`);
  await page.fill("#f-password", "password1234");
  await page.click("button:has-text('Create workspace')");
  await page.waitForURL("**/dashboard", { timeout: 20000 });
});
await step("session survives reload", async () => { await page.reload(); await page.waitForURL("**/dashboard"); });
await step("manual lead is created and assigned", async () => {
  await page.goto(`${base}/leads`);
  await page.click("button:has-text('New lead')");
  await page.fill("#fld-firstName", "Sara");
  await page.fill("#fld-lastName", "Khan");
  await page.fill("#fld-phone", "+923001234567");
  await page.fill("#nl-message", "Need a 10kW rooftop quote before Friday");
  await page.click("button:has-text('Create & assign')");
  await page.getByRole("link", { name: "Sara Khan" }).first().waitFor({ timeout: 15000 });
  await page.getByRole("timer").first().waitFor();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/leads.png` });
await step("owner acknowledges lead", async () => {
  await page.click("button:has-text('Acknowledge')");
  await page.getByLabel("Acknowledged").first().waitFor({ timeout: 10000 });
});
await step("logout and bad password is rejected", async () => {
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  await p2.goto(`${base}/login`);
  await p2.fill("#f-email", `taha-${tag}@demo.dev`); await p2.fill("#f-password", "wrong-password");
  await p2.click("button:has-text('Sign in')");
  await p2.getByRole("alert").waitFor({ timeout: 10000 });
});
await step("unauthenticated user redirected to login", async () => {
  const ctx = await browser.newContext(); const p3 = await ctx.newPage();
  await p3.goto(`${base}/leads`); await p3.waitForURL("**/login");
});
if (errors.length) console.log("Page errors:", errors.slice(0, 5));
await browser.close();

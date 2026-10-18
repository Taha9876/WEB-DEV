// Sends a progress report from the UI and prints the result + preview link.
import { chromium } from "playwright-core";
const out = process.argv[2];
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })).newPage();
await page.goto("http://localhost:3000/login");
await page.fill("#f-email", "owner@sunrise.solar"); await page.fill("#f-password", "relay-demo-2026");
await page.click("button:has-text('Sign in')"); await page.waitForURL("**/dashboard", { timeout: 30000 });
await page.goto("http://localhost:3000/settings/reports", { waitUntil: "networkidle" });
const t0 = Date.now();
await page.click("button:has-text('Send progress report')");
await page.getByText(/Report sent|couldn't|failed/i).first().waitFor({ timeout: 90000 });
console.log("result after", Date.now() - t0, "ms:", await page.locator("[data-sonner-toast]").first().innerText());
await page.reload({ waitUntil: "networkidle" });
const href = await page.getByRole("link", { name: /Preview/ }).first().getAttribute("href").catch(() => null);
console.log("preview:", href);
if (href) { await page.goto(href, { waitUntil: "networkidle" }); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/email-preview.png`, fullPage: false }); }
await b.close();

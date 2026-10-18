// Measures in-app click navigation time (sidebar click → page content rendered).
import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto("http://localhost:3000/login");
await page.fill("#f-email", "owner@sunrise.solar"); await page.fill("#f-password", "relay-demo-2026");
await page.click("button:has-text('Sign in')"); await page.waitForURL("**/dashboard", { timeout: 30000 });
await page.waitForTimeout(1500);
for (const [label, h1] of [["Leads", "Leads"], ["Contacts", "Contacts"], ["Pipeline", "Sales"], ["Dashboard", "Good"], ["Recovery queue", "Recovery"], ["Team", "Team"], ["Email reports", "Email"]]) {
  const t0 = Date.now();
  await page.getByRole("link", { name: label, exact: true }).first().click();
  const skeleton = await page.locator('[aria-label="Loading"]').first().waitFor({ timeout: 1500 }).then(() => Date.now() - t0).catch(() => null);
  await page.locator("h1", { hasText: h1 }).first().waitFor({ timeout: 20000 });
  console.log(label.padEnd(16), "content", String(Date.now() - t0).padStart(5), "ms", skeleton !== null ? `(skeleton at ${skeleton} ms)` : "");
}
await b.close();

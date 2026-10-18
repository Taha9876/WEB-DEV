// App screens in a given theme. Usage: node scripts/theme-shots.mjs <dir> <light|dark> <email> <password> <paths...>
import { chromium } from "playwright-core";
const [out, theme, email, password, ...paths] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:3000/login"); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/T-${theme}-login.png` });
await page.fill("#f-email", email); await page.fill("#f-password", password);
await page.click("button:has-text('Sign in')"); await page.waitForURL("**/dashboard", { timeout: 30000 });
for (const p of paths) { await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" }); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/T-${theme}${p.replace(/[^a-z0-9]/gi, "_")}.png` }); }
console.log(theme, errs.length ? errs.slice(0, 3) : "ok"); await b.close();

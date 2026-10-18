// Screenshots down the landing page. Usage: node scripts/scroll-shots.mjs <dir> <light|dark> <startVh> <stepVh> <count>
import { chromium } from "playwright-core";
const [out, theme, start = "4.4", step = "1", count = "10"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
for (let i = 0; i < +count; i++) {
  const y = (+start + i * +step) * 900;
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.mouse.move(400 + i * 60, 300, { steps: 6 }); await page.mouse.move(800 + i * 40, 520, { steps: 10 });
  await page.waitForTimeout(1700);
  await page.screenshot({ path: `${out}/S-${theme}-${String(i).padStart(2, "0")}.png` });
}
console.log(theme, "page height", await page.evaluate(() => document.body.scrollHeight / innerHeight), errs.length ? errs.slice(0, 3) : "ok");
await b.close();

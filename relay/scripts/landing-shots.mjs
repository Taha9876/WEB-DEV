// Landing screenshots in both themes at several scroll depths. Usage: node scripts/landing-shots.mjs <dir> [width] [height]
import { chromium } from "playwright-core";
const [out, w = "1440", h = "900"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, colorScheme: theme });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.mouse.move(+w * 0.3, +h * 0.4); await page.mouse.move(+w * 0.45, +h * 0.55, { steps: 12 });
  await page.waitForTimeout(1800);
  const vh = +h;
  for (const [name, y] of [["0", 0], ["open", vh * 1.25], ["inner", vh * 2.2], ["shut", vh * 3.15], ["counters", vh * 3.5]]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await page.mouse.move(+w * 0.6, +h * 0.4, { steps: 8 });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/L-${theme}-${w}-${name}.png` });
  }
  console.log(theme, errs.length ? errs.slice(0, 3) : "ok");
  await ctx.close();
}
await b.close();

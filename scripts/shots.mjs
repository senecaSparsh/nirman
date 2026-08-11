import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const desktop = (process.env.DESKTOP || "/,/procurement,/stock,/projects,/approvals,/finance,/reports,/materials").split(",");
const mobile = (process.env.MOBILE || "/m,/m/pulse,/m/site").split(",");

const browser = await chromium.launch();

async function shoot(paths, viewport, prefix, dpr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  for (const p of paths) {
    const name = prefix + (p === "/" ? "root" : p.replace(/\//g, "_")) + ".png";
    try {
      await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle", timeout: 60000 });
    } catch { }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}`, fullPage: process.env.FULL === "1" });
    console.log("shot", name);
  }
  await ctx.close();
}

await shoot(desktop, { width: 1512, height: 950 }, "d");
await shoot(mobile, { width: 390, height: 844 }, "m", 2);
await browser.close();

import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const pages = [
  "material-issues", "expenses", "stock", "gate-pass", "material-sales",
  "procurement", "units", "rentals", "sales", "expense-claims",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const r = await page.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const c = await r.json();
await page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: c.email, password: c.password } });

for (const p of pages) {
  try {
    await page.goto(`${BASE}/m/${p}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("input", { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1200);
    // crop just the region around the search input
    const box = await page.evaluate(() => {
      const i = document.querySelector("input[placeholder]");
      if (!i) return null;
      const r = i.getBoundingClientRect();
      return { y: Math.max(0, r.top - 10), h: 80 };
    });
    if (box) {
      await page.screenshot({ path: `/tmp/cmp-${p}.png`, clip: { x: 0, y: box.y, width: 390, height: box.h } });
      console.log(p, "shot at y=" + Math.round(box.y));
    } else console.log(p, "no input");
  } catch (e) { console.log(p, "ERR", e.message.split("\n")[0]); }
}
await browser.close();

import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const pages = process.argv[2] ? process.argv[2].split(",") : [
  "attendance", "dprs", "gate-pass", "land", "materials",
  "projects", "quality-control", "safety", "units",
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
    await page.waitForSelector("input[placeholder]", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const i = document.querySelector("input[placeholder]");
      if (!i) return { top: null };
      return { top: Math.round(i.getBoundingClientRect().top) };
    });
    if (m.top !== null) await page.screenshot({ path: `/tmp/hdr-${p}.png`, clip: { x: 0, y: 0, width: 390, height: Math.min(300, m.top + 60) } });
    console.log(p.padEnd(18), "searchTop:", m.top);
  } catch (e) { console.log(p, "ERR", e.message.split("\n")[0].slice(0, 60)); }
}
await browser.close();

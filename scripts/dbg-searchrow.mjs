import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const pages = [
  { name: "material-issues", url: "/m/material-issues" },
  { name: "expenses", url: "/m/expenses" },
  { name: "departments", url: "/m/departments" },
  { name: "stock-locations", url: "/m/stock-locations" },
  { name: "gate-pass", url: "/m/gate-pass" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

// login: get demo creds, then sign in via better-auth
const res = await page.request.post(`${BASE}/api/auth/demo-login`, {
  data: { role: "OWNER" },
});
const creds = await res.json();
console.log("demo-login:", res.status(), creds.email);
const signIn = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: creds.email, password: creds.password },
});
console.log("sign-in:", signIn.status());

for (const p of pages) {
  await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // wait for search input to appear (cold compile tolerance)
  await page.waitForSelector("input", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const row = await page.evaluate(() => {
    const input = document.querySelector("input");
    if (!input) return null;
    const header = input.closest("div");
    // walk up to the flex row containing input + buttons
    let row = input.parentElement;
    while (row && getComputedStyle(row).display !== "flex") row = row.parentElement;
    const r = row?.getBoundingClientRect();
    const i = input.getBoundingClientRect();
    const buttons = row ? [...row.querySelectorAll("button")].length : 0;
    const cs = row ? getComputedStyle(row) : null;
    return {
      inputW: Math.round(i.width),
      inputH: Math.round(i.height),
      rowW: r ? Math.round(r.width) : null,
      rowH: r ? Math.round(r.height) : null,
      buttons,
      gap: cs?.gap,
      padX: cs ? `${cs.paddingLeft}/${cs.paddingRight}` : null,
    };
  });
  await page.screenshot({ path: `/tmp/row-${p.name}.png`, clip: { x: 0, y: 0, width: 390, height: 220 } });
  console.log(p.name, JSON.stringify(row));
}
await browser.close();

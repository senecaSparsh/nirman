import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
await p.close();
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
for (const path of ["/m/hr/employees", "/m/hr/employees?tab=crews", "/m/accounts?tab=planned", "/m/safety?tab=hazards"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const len = (await page.locator("main").innerText()).length;
  console.log(`${path} -> ${page.url().includes("sign-in") ? "SIGN-IN!" : "main=" + len}`);
}
await browser.close();

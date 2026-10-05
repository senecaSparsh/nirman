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
await page.goto(`${BASE}/m/accounts?tab=planned`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("main:", (await page.locator("main").innerText()).slice(0, 700).replace(/\n/g, " | "));
await page.screenshot({ path: "/tmp/planned-tab.png" });
// create a recurring expense via UI
const newBtn = page.getByRole("button", { name: /^New$/ }).first();
if (await newBtn.count()) {
  await newBtn.click(); await page.waitForTimeout(900);
  await page.getByPlaceholder(/site rent/i).fill("QA Site Rent");
  await page.locator('input[placeholder="0"]').first().fill("12000");
  await page.getByRole("button", { name: /set recurring/i }).click();
  await page.waitForTimeout(3000);
  console.log("after:", (await page.locator("main").innerText()).slice(0, 500).replace(/\n/g, " | "));
}
await browser.close();

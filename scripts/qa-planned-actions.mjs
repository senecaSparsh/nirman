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
page.on("response", r => { if (/recurring|budget|expense/.test(r.url())) console.log(`${r.request().method()} ${r.url().replace(BASE,"").slice(0,60)} -> ${r.status()}`); });
await page.goto(`${BASE}/m/accounts?tab=planned`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// Generate due
const gen = page.getByRole("button", { name: /generate \d+ due/i });
console.log("gen btn:", await gen.count());
if (await gen.count()) { await gen.click(); await page.waitForTimeout(2500); }
// Pause
await page.getByRole("button", { name: /pause qa site rent/i }).click();
await page.waitForTimeout(1500);
console.log("after pause:", (await page.locator("main").innerText()).slice(0, 300).replace(/\n/g," | "));
// Budget create
await page.getByRole("button", { name: /^New$/ }).nth(1).click();
await page.waitForTimeout(1200);
await page.getByPlaceholder(/site rent|labour welfare/i).fill("QA Fuel Budget");
await page.locator('input[inputmode="decimal"]').first().fill("50000");
await page.getByRole("button", { name: /set budget/i }).click();
await page.waitForTimeout(3000);
console.log("after budget:", (await page.locator("main").innerText()).slice(0, 500).replace(/\n/g," | "));
await page.screenshot({ path: "/tmp/planned-final.png" });
await browser.close();

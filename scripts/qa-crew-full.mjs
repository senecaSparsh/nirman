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
page.on("response", r => { if (r.url().includes("/api/crews")) console.log(`${r.request().method()} /api/crews -> ${r.status()}`); });
await page.goto(`${BASE}/m/hr/employees?tab=crews`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

// CREATE via UI
await page.getByRole("button", { name: /add new crew/i }).click();
await page.waitForTimeout(1000);
await page.getByPlaceholder(/masonry gang/i).fill("QA Masonry Gang");
// pick first two member checkboxes
const memberBtns = page.locator('.max-h-56 button');
console.log("member rows:", await memberBtns.count());
await memberBtns.nth(0).click(); await memberBtns.nth(1).click();
await page.getByRole("button", { name: /^create crew$/i }).click();
await page.waitForTimeout(3500);
console.log("after create:", (await page.locator("main").innerText()).slice(0, 300).replace(/\n/g, " | "));

// EDIT via pencil
await page.getByRole("button", { name: "Edit QA Masonry Gang" }).first().click();
await page.waitForTimeout(1200);
await page.getByPlaceholder(/masonry gang/i).fill("QA Masonry Gang B");
await page.getByRole("button", { name: /save crew/i }).click();
await page.waitForTimeout(3000);
console.log("after edit:", (await page.locator("main").innerText()).slice(0, 300).replace(/\n/g, " | "));
await page.screenshot({ path: "/tmp/crews-after.png" });
await browser.close();

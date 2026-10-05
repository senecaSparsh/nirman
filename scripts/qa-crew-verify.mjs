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
await page.goto(`${BASE}/m/hr/employees?tab=crews`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
console.log("list:", (await page.locator("main").innerText()).slice(0, 600).replace(/\n/g, " | "));
// expand the crew card
await page.getByRole("button", { name: /QA Gang X/i }).first().click().catch(()=>{});
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/crews-list.png" });
// open edit dialog via pencil
const edit = page.getByRole("button", { name: /edit.*gang|edit/i });
console.log("edit buttons:", await edit.count());
await edit.first().click().catch((e)=>console.log("edit click:", e.message.slice(0,80)));
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/crew-edit.png" });
await browser.close();

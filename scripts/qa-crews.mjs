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
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 300)));
await page.goto(`${BASE}/m/hr/employees?tab=crews`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("URL:", page.url());
console.log((await page.locator("main").innerText()).slice(0, 900).replace(/\n/g, " | "));
// click the FAB to open new-crew dialog
const fab = page.getByRole("button", { name: /add new crew/i });
console.log("crew FAB:", await fab.count());
if (await fab.count()) {
  await fab.click();
  await page.waitForTimeout(1200);
  const dialog = await page.locator("body").innerText();
  console.log("dialog open:", /new crew/i.test(dialog));
  // fill name + pick a member
  await page.getByPlaceholder(/masonry gang/i).fill("QA Test Gang");
  const memberBtns = page.locator('button:has-text("Raju"), button:has-text("Site")');
  console.log("member buttons:", await memberBtns.count());
  await page.screenshot({ path: "/tmp/crew-form.png" });
  await page.getByRole("button", { name: /create crew/i }).click();
  await page.waitForTimeout(3000);
  console.log("after:", (await page.locator("main").innerText()).slice(0, 400).replace(/\n/g, " | "));
}
await page.screenshot({ path: "/tmp/crews-tab.png" });
await browser.close();

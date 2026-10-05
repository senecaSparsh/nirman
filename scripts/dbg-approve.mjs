import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data:{role:"OWNER"} });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data:{email,password} });
await p.close();
const page = await ctx.newPage();
page.on("response", async r => { if(r.url().includes("/api/") && r.status()<300 && r.request().method()!=="GET") console.log("MUT", r.status(), r.url().split(BASE)[1].slice(0,80)); });
const claim = await prisma.expenseClaim.findFirst({ orderBy:{createdAt:"desc"} });
console.log("claim:", claim.id, claim.status);
await page.goto(`${BASE}/m/approvals`, { waitUntil:"networkidle", timeout:120000 });
await page.waitForTimeout(3500);
console.log("BODY:", (await page.evaluate(()=>document.querySelector("main")?.innerText.slice(0,900))));
await page.screenshot({path:"/tmp/approvals.png"});
// find the claim card → open → approve
const card = page.locator('text=/expense|claim|diesel|travel/i').first();
if (await card.isVisible().catch(()=>false)) { await card.click(); await page.waitForTimeout(2000); }
console.log("AFTER CLICK:", (await page.evaluate(()=>document.querySelector("main")?.innerText.slice(-600))));
await page.screenshot({path:"/tmp/approvals-2.png"});
await browser.close(); await prisma.$disconnect();

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
page.on("response", async r => { if(r.url().includes("/api/")&&r.request().method()!=="GET") console.log("MUT", r.status(), r.url().split(BASE)[1].slice(0,90)); });
const claim = await prisma.expenseClaim.findFirst({ orderBy:{createdAt:"desc"} });
await page.goto(`${BASE}/m/approvals`, { waitUntil:"networkidle", timeout:120000 });
await page.waitForTimeout(3000);
// expand the LAST Yash card (the QA one has 'diesel' text after expand)
await page.locator('main >> text=Yash Saxena').last().click();
await page.waitForTimeout(1500);
// count approve buttons
const n = await page.getByRole("button",{name:/^Approve$/i}).count();
console.log("approve buttons:", n);
await page.getByRole("button",{name:/^Approve$/i}).last().click();
await page.waitForTimeout(1000);
// maybe a confirm sheet opened
const c = await page.getByRole("button",{name:/confirm|yes|approve/i}).count();
console.log("post-click confirm count:", c);
if (c) { await page.getByRole("button",{name:/confirm|yes, approve/i}).last().click().catch(()=>{}); await page.waitForTimeout(3000); }
await page.screenshot({path:"/tmp/appr4.png"});
const after = await prisma.expenseClaim.findUnique({ where:{ id: claim.id } });
console.log("CLAIM:", after.status);
await browser.close(); await prisma.$disconnect();

import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../packages/db/src/generated/prisma/client.js");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const STAMP = Date.now().toString(36).slice(-6).toUpperCase();
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data:{role:"SITE_ENGINEER"} });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data:{email,password} });
await p.close();
const page = await ctx.newPage();
page.on("response", r => { if (r.url().includes("/api/dprs")) console.log("DPR API", r.status()); });
await page.goto(`${BASE}/m/site/dpr`, { waitUntil:"networkidle", timeout:120000 });
await page.waitForTimeout(2500);
// Click project option Site One
await page.locator('text=/Site One/').first().click().catch(e=>console.log('site',e.message.slice(0,60)));
await page.waitForTimeout(1000);
// work type
await page.locator('text=/Foundation/').first().click().catch(e=>console.log('wt',e.message.slice(0,60)));
await page.waitForTimeout(800);
// summary
await page.locator('textarea[placeholder="What work was done today?"]').fill(`QA chain ${STAMP} RCC slab cast`);
// submit
await page.getByRole("button",{name:/submit dpr/i}).click();
await page.waitForTimeout(4000);
const after = await page.evaluate(()=>document.body.innerText.slice(0,500));
console.log("AFTER:", after);
const dpr = await prisma.dailyProgressReport.findFirst({ where:{ workSummary:{contains:STAMP} }, orderBy:{createdAt:"desc"} });
console.log("DPR ROW:", dpr ? `${dpr.dprNumber} status=${dpr.status}` : "none");
await page.screenshot({path:"/tmp/dpr-done.png"});
await browser.close(); await prisma.$disconnect();

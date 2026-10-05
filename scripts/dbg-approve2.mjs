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
await page.goto(`${BASE}/m/approvals`, { waitUntil:"networkidle", timeout:120000 });
await page.waitForTimeout(3000);
// inspect interactive elements on a claim row
const html = await page.evaluate(()=>{
  const cards=[...document.querySelectorAll('main [class]')].filter(e=>/Claim|₹1\.3K/.test(e.innerText||'') && e.children.length>2);
  return cards.slice(0,3).map(c=>({tag:c.tagName,cls:c.className.slice(0,80)}));
});
console.log("CARDS:", JSON.stringify(html));
// click the whole row containing 'Yash Saxena'
const row = page.locator('main >> text=Yash Saxena').first();
await row.click();
await page.waitForTimeout(3000);
console.log("URL:", page.url());
console.log("BODY:", (await page.evaluate(()=>document.querySelector("main")?.innerText.slice(-700))));
await page.screenshot({path:"/tmp/appr-detail.png"});
await browser.close(); await prisma.$disconnect();

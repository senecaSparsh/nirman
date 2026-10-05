/** Fast focused sweep — key mobile pages × role, no prewarm (warm server). */
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const KEY_ROUTES = ["/m","/m/home","/m/attendance","/m/site/dpr","/m/dprs","/m/procurement","/m/requisitions","/m/expense-claims","/m/expenses","/m/approvals","/m/sales","/m/material-sales","/m/customers","/m/leads","/m/hr","/m/hr/employees","/m/hr/payroll","/m/books","/m/books/gl","/m/inventory","/m/stock","/m/transfers","/m/gate-pass","/m/projects","/m/settings","/m/notifications","/m/pulse","/m/queue","/m/me","/m/reports"];
const ROLES = ["OWNER","SITE_ENGINEER","SECURITY_GUARD","FINANCE_HEAD","SALES_MANAGER","STORE_KEEPER"];
const browser = await chromium.launch();
const results = {};
for (const role of ROLES) {
  const ctx = await browser.newContext({ userAgent: UA, viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const p = await ctx.newPage();
  let body;
  for (let i=0;i<4;i++){ const r = await p.request.post(`${BASE}/api/auth/demo-login`,{data:{role}}); if(r.ok()){body=await r.json();break;} if(r.status()===429){await p.waitForTimeout(12000);continue;} }
  if(!body){ console.log(`${role}: login failed`); await ctx.close(); continue; }
  await p.request.post(`${BASE}/api/auth/sign-in/email`, { data:{email:body.email,password:body.password} });
  await p.close();
  const page = await ctx.newPage();
  for (const route of KEY_ROUTES) {
    let status=0, len=-1, flag="";
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil:"domcontentloaded", timeout:30000 });
      status = resp?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout:8000 }).catch(()=>{});
      await page.waitForTimeout(300);
      len = await page.evaluate(()=>document.querySelector("main")?.innerText.trim().length ?? document.body.innerText.trim().length);
    } catch(e){ flag = String(e).slice(0,40); }
    const bad = status>=400 || (status===200 && len<50) || flag;
    if (bad) console.log(`${role.padEnd(18)} ${route.padEnd(26)} s=${status} len=${len} ${flag}`);
    results[`${role}${route}`] = {status,len};
  }
  await ctx.close();
  console.log(`${role} done`);
}
await browser.close();

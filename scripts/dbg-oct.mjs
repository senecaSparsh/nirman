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
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data:{role:"SITE_ENGINEER"} });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data:{email,password} });
await p.close();
const page = await ctx.newPage();
// try a DPR dated tomorrow (Oct 1) — outside locked Sept window
const proj = await prisma.project.findFirst({ where:{ deletedAt:null } });
const r = await page.request.post(`${BASE}/api/dprs`, { data:{
  projectId: proj.id, date: "2026-10-01", workType: "Structure",
  workSummary: "QA future-date DPR Oct1", status: "DRAFT"
} });
console.log("Oct1 DPR:", r.status(), (await r.text()).slice(0,200));
// and confirm a Sept-date is still blocked
const r2 = await page.request.post(`${BASE}/api/dprs`, { data:{
  projectId: proj.id, date: "2026-09-29", workType: "Structure",
  workSummary: "QA sept-date DPR", status: "DRAFT"
} });
console.log("Sep29 DPR:", r2.status(), (await r2.text()).slice(0,200));
await browser.close(); await prisma.$disconnect();

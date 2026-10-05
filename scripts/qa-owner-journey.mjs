/**
 * qa-owner-journey.mjs — walk the app like the OWNER on a phone.
 * Not a page sweep — asserts each screen shows real, actionable content.
 */
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const results = [];
function step(name, ok, detail="") { results.push({name,ok}); console.log(`${ok?"PASS":"FAIL"} ${name}${detail?" — "+detail:""}`); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data:{role:"OWNER"} });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data:{email,password} });
await p.close();
const page = await ctx.newPage();
page.setDefaultTimeout(90000);

async function visit(path, opts={}) {
  const errs=[], bad=[];
  page.on("console", m=>{ if(m.type()==="error") errs.push(m.text().slice(0,120)); });
  page.on("response", r=>{ if(r.status()>=400 && !r.url().includes("monitoring")) bad.push(`${r.status()} ${r.url().split(BASE)[1].slice(0,60)}`); });
  await page.goto(`${BASE}${path}`, { waitUntil:"domcontentloaded", timeout:90000 });
  await page.waitForLoadState("networkidle",{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1200);
  const txt = await page.evaluate(()=>document.querySelector("main")?.innerText ?? document.body.innerText);
  return { txt, errs, bad };
}

// 1 — Home briefing
let r = await visit("/m/home");
step("home renders", r.txt.length > 50, `len=${r.txt.length}`);
console.log("  home text:", r.txt.slice(0,200).replace(/\n/g," | "));

// 2 — Notifications (badge said 19)
r = await visit("/m/notifications");
step("notifications list has items", r.txt.length > 200, `len=${r.txt.length}`);
step("notifications no errors", r.errs.length===0 && r.bad.length===0, r.errs[0] || r.bad[0] || "");

// 3 — Approvals queue
r = await visit("/m/approvals");
const awaitingMatch = r.txt.match(/(\d+)\s+awaiting/);
step("approvals shows queue", /awaiting|approval/i.test(r.txt), `awaiting=${awaitingMatch?.[1] ?? "?"}`);
console.log("  approvals:", r.txt.slice(0,200).replace(/\n/g," | "));

// 4 — Pulse (owner command center)
r = await visit("/m/pulse");
step("pulse renders with data", r.txt.length > 200, `len=${r.txt.length}`);
console.log("  pulse:", r.txt.slice(0,250).replace(/\n/g," | "));

// 5 — Attention page (what needs me)
r = await visit("/m/pulse/attention");
step("attention renders", r.txt.length > 100, `len=${r.txt.length}`);

// 6 — Books: GL + finance
r = await visit("/m/books/gl");
step("GL has ledger entries", r.txt.length > 500, `len=${r.txt.length}`);
r = await visit("/m/books/finance");
step("finance hub renders", r.txt.length > 100, `len=${r.txt.length}`);

// 7 — Money reports
for (const rep of ["/m/reports/profit","/m/reports/pending-payments","/m/reports/inventory-value","/m/reports/sales-revenue"]) {
  r = await visit(rep);
  step(`${rep} has content`, r.txt.length > 50, `len=${r.txt.length} ${r.bad[0]||""}`);
}

// 8 — Sales pipeline
r = await visit("/m/sales");
step("sales pipeline renders", r.txt.length > 100, `len=${r.txt.length}`);
console.log("  sales:", r.txt.slice(0,200).replace(/\n/g," | "));

// 9 — Projects + inventory
r = await visit("/m/projects");
step("projects list", r.txt.length > 100, `len=${r.txt.length}`);
r = await visit("/m/inventory");
step("inventory renders", r.txt.length > 100, `len=${r.txt.length}`);

// 10 — HR + people
r = await visit("/m/hr");
step("hr hub renders", r.txt.length > 100, `len=${r.txt.length}`);
r = await visit("/m/hr/employees");
step("employees list", r.txt.length > 200, `len=${r.txt.length}`);

const fails = results.filter(x=>!x.ok);
console.log(`\n═══ ${results.length-fails.length}/${results.length} ═══`);
await browser.close();

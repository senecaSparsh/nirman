import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
async function session(role) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role } });
  const { email, password } = await res.json();
  await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
  return { ctx, p };
}
const eng = await session("SITE_ENGINEER");
const r = await eng.p.request.get(`${BASE}/api/search?q=Ramesh`);
const d = await r.json();
console.log("engineer leads:", (d.results ?? []).filter(x => x.type === "lead").length);
const own = await session("OWNER");
const r2 = await own.p.request.get(`${BASE}/api/search?q=Ramesh`);
const d2 = await r2.json();
console.log("owner leads:", (d2.results ?? []).filter(x => x.type === "lead").length);
await browser.close();

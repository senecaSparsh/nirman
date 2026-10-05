import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ctx = await (await chromium.launch()).newContext();
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
// search by name
const r1 = await p.request.get(`${BASE}/api/search?q=Ramesh`);
const d1 = await r1.json();
console.log("name search:", d1.results?.filter((x) => x.type === "lead"));
// search by phone
const r2 = await p.request.get(`${BASE}/api/search?q=987650`);
const d2 = await r2.json();
console.log("phone search:", d2.results?.filter((x) => x.type === "lead"));
// scoped user (SITE_ENGINEER) should NOT see leads (no sales.view)
const p2 = await ctx.newPage();
const res2 = await p2.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "SITE_ENGINEER" } });
const c2 = await res2.json();
await p2.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: c2.email, password: c2.password } });
const r3 = await p2.request.get(`${BASE}/api/search?q=Ramesh`);
const d3 = await r3.json();
console.log("engineer sees leads:", d3.results?.filter((x) => x.type === "lead").length ?? 0);
await ctx.browser().close();

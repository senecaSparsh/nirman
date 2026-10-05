import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ctx = await (await chromium.launch()).newContext();
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
const crews = await (await p.request.get(`${BASE}/api/crews`)).json();
for (const c of crews.filter((x) => x.name.startsWith("QA"))) {
  const r1 = await p.request.patch(`${BASE}/api/crews/${c.id}`, { data: { memberIds: [] } });
  const r2 = await p.request.delete(`${BASE}/api/crews/${c.id}`);
  console.log(c.name, "unassign:", r1.status(), "delete:", r2.status());
}
const left = await (await p.request.get(`${BASE}/api/crews`)).json();
console.log("crews left:", left.length);
await ctx.browser().close();

import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ctx = await (await chromium.launch()).newContext();
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
const r = await p.request.post(`${BASE}/api/expense-budgets`, {
  data: { category: "QA Fuel Budget", amount: 50000, periodStart: "2026-09-01", periodEnd: "2026-09-30" },
});
console.log("POST budgets:", r.status(), await r.text());
await p.close(); await ctx.browser().close();

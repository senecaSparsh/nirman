import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ctx = await (await chromium.launch()).newContext();
const p = await ctx.newPage();
const res = await p.request.post(`${BASE}/api/auth/demo-login`, { data: { role: "OWNER" } });
const { email, password } = await res.json();
await p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
for (const id of ["cmumqa8t30058vlkrg0fa8237","cmumqbite005cvlkreyug9xtw","cmumqcixb005gvlkr1jcsp62v","cmumqcvni005kvlkrhx66q9aq"]) {
  const r = await p.request.delete(`${BASE}/api/crews/${id}`);
  console.log("DELETE", id, r.status(), await r.text());
}
await p.close(); await ctx.browser().close();

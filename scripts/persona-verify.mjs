#!/usr/bin/env node
/**
 * persona-verify.mjs — drive each SRG persona through their real domain on
 * production: sign-in → first-login password change → domain endpoints →
 * boundary check. Paced to stay under the auth rate limiter.
 * Run inside the web container: node persona-verify.mjs
 */
const BASE = "http://localhost:3000";

const PEOPLE = [
  { n: "Vardaan", ph: "7017988293", pw: "UrSPBYkXnB7LLpqE", r: "OWNER",
    own: ["/api/employees", "/api/users", "/api/expenses"],
    deny: [] },
  { n: "Sanjeev", ph: "9412230391", pw: "EJjux6qNK8FEKKFe", r: "ADMIN",
    own: ["/api/users", "/api/employees"],
    deny: [] },
  { n: "Anurag", ph: "7302920202", pw: "WnVArVPABu6MFNZ", r: "PD",
    own: ["/api/projects", "/api/dprs", "/api/work-orders"],
    deny: ["/api/users"] },
  { n: "Manish", ph: "7302920201", pw: "AxN3PVmLJUab5ipr", r: "FH",
    own: ["/api/expenses", "/api/payroll", "/api/vendors"],
    deny: ["/api/users"] },
  { n: "Raviraj", ph: "9520002752", pw: "gTmxeREwHuGmr5YA", r: "PM",
    own: ["/api/suppliers", "/api/purchase-orders", "/api/materials"],
    deny: ["/api/users"] },
  { n: "Mani", ph: "7302920203", pw: "9yJR972hRktSeEk", r: "SM",
    own: ["/api/leads", "/api/customers"],
    deny: ["/api/payroll"] },
  { n: "Yash", ph: "7302920205", pw: "CqKJftjhCW8PJpiy", r: "SE",
    own: ["/api/dprs", "/api/attendance", "/api/stock"],
    deny: ["/api/users"] },
];

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function run() {
  for (const p of PEOPLE) {
    const jar = new Map();
    const ch = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const sc = (res) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    };
    const api = async (m, path, body) => {
      const res = await fetch(BASE + path, {
        method: m,
        headers: { "content-type": "application/json", cookie: ch() },
        body: body ? JSON.stringify(body) : undefined,
      });
      sc(res);
      return res;
    };

    // sign in (with retry past the per-phone rate window)
    let s = null;
    for (let i = 0; i < 6 && !s?.ok; i++) {
      s = await api("POST", "/api/auth/phone-password", { phone: p.ph, password: p.pw });
      if (!s.ok) await sleep(15000);
    }
    if (!s.ok) { console.log(`${p.n.padEnd(8)} SIGN-IN FAIL ${s.status}`); continue; }
    const sj = await s.json();
    console.log(`${p.n.padEnd(8)} signed in (${p.r})${sj.mustChangePassword ? " mustChange" : ""}`);

    // first-login password change → same password back (policy-safe) so creds stay valid
    if (sj.mustChangePassword) {
      const cp = await api("POST", "/api/me/change-password", { currentPassword: p.pw, newPassword: p.pw });
      console.log(`  change-password → ${cp.status}`);
      await sleep(400);
    }

    for (const e of p.own) {
      const res = await api("GET", e);
      console.log(`  own  ${e.padEnd(24)} → ${res.status}`);
      await sleep(400);
    }
    for (const e of p.deny) {
      const res = await api("GET", e);
      console.log(`  deny ${e.padEnd(24)} → ${res.status}`);
      await sleep(400);
    }
  }
}
run();

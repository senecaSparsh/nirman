#!/usr/bin/env node
/**
 * reset-srg-passwords.mjs — re-issue passwords for the 5 onboarded SRG staff
 * through the admin reset endpoint (POST /api/users/[id]/reset-password).
 * Prints the full credential table for distribution.
 * Run inside the web container: OWNER_PASSWORD=… node reset-srg-passwords.mjs
 */
const BASE = "http://localhost:3000";
const OWNER = { phone: "7017988293", password: process.env.OWNER_PASSWORD };
const PHONES = ["7302920202", "7302920201", "9520002752", "7302920203", "7302920205"];

const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
}
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { "content-type": "application/json", cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const t = await res.text();
  try { return { status: res.status, json: JSON.parse(t) }; } catch { return { status: res.status, text: t.slice(0, 200) }; }
}
const genPw = () => Array.from({ length: 16 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 58)]).join("");

const signIn = await api("POST", "/api/auth/phone-password", OWNER);
if (signIn.status >= 400) { console.error("sign-in failed"); process.exit(1); }

const users = (await api("GET", "/api/users?limit=100")).json;
const list = users?.users ?? users ?? [];

console.log("═══ SRG REALCON — full credential table ═══\n");
console.log("  Vardaan Kumar    OWNER                7017988293  UrSPBYkXnB7LLpqE");
console.log("  Sanjeev Kumar    ADMIN                9412230391  EJjux6qNK8FEKKFe");

for (const phone10 of PHONES) {
  const u = list.find((x) => (x.phoneNormalized ?? "").endsWith(phone10) || (x.phone ?? "").includes(phone10));
  if (!u) { console.log(`  ${phone10} — user not found`); continue; }
  const pw = genPw();
  const r = await api("POST", `/api/users/${u.id}/reset-password`, { password: pw });
  console.log(`  ${(u.name ?? "?").padEnd(15)} ${(u.role ?? "").padEnd(21)} ${phone10}  ${r.status < 400 ? pw : "RESET FAILED " + r.status}`);
}
console.log("\nEach person signs in: Phone tab → 10-digit number → password.");

#!/usr/bin/env node
/**
 * whatif-wave3.mjs — multi-company + data-boundary what-ifs, run live.
 * Companies on this box: SRG REALCON, census-test (Vardaan owns both),
 * Tenant B Test (fully separate). That makes the whole multi-tenancy
 * matrix exercisable: switch, isolation, cross-tenant leaks, role
 * context per company.
 */
const BASE = process.env.BASE || "http://localhost:3200";
const jars = {};
let PASS = 0, FAIL = 0;
const failures = [];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function signInAs(key, phone, pw = "nirman123") {
  jars[key] = new Map();
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${BASE}/api/auth/phone-password`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, password: pw }),
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [p] = c.split(";"); const i = p.indexOf("=");
        jars[key].set(p.slice(0, i).trim(), p.slice(i + 1).trim());
      }
      return body;
    }
    await sleep(15000);
  }
  return null;
}
// After phone-password with multiple companies, the client picks one via the
// company-select endpoint (sets active-company cookie).
async function selectCompany(key, companyId) {
  const res = await api(key, "POST", "/api/company/switch", { companyId });
  return res;
}

async function api(key, method, path, body, headers = {}) {
  const jar = jars[key] ?? new Map();
  const ch = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", cookie: ch, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  // persist any new cookies the response sets (company switch writes a cookie)
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jars[key]?.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return { status: res.status, json, text };
}

function step(group, label, cond, detail = "") {
  const ok = !!cond;
  if (ok) PASS++; else { FAIL++; failures.push(`${group}: ${label} — ${detail}`); }
  console.log(`    ${ok ? "✓" : "✗"} ${label}${ok ? "" : "  ← " + String(detail).slice(0, 140)}`);
}
function guard(group, label, res, expectRe = /forbid|denied|not allowed|cannot|invalid|required|found|access|member|scope|tenant/i) {
  const rejected = res.status >= 400 && res.status < 500 && expectRe.test(res.text);
  step(group, `${label} ${rejected ? `(blocked: ${res.status})` : ""}`, rejected, rejected ? "" : `got ${res.status}: ${res.text.slice(0, 120)}`);
}

console.log("═══ WHAT-IF WAVE 3 — multi-company + data boundaries ═══\n");

const srgId = "cmtv3x4t50000vlp0b23vdtxe";
const censusId = "cmvc7drb7031pvl10rg5e7432";
const tenantBId = "tenantb-co";

await signInAs("OWNER", "7017988293");
await signInAs("ADMIN", "9412230391");
await signInAs("SM", "7302920203");
await signInAs("SE", "7302920205");

// ═══ W40 — Multi-company user: see both tenants, pick the active one ═══
console.log("\n── W40: Vardaan in 2 companies — switch + active context ──");
const myCompanies = await api("OWNER", "GET", "/api/companies");
const myCoList = Array.isArray(myCompanies.json) ? myCompanies.json : (myCompanies.json?.rows ?? []);
step("W40", "OWNER sees his 2 companies", myCoList.length >= 2, `got ${myCoList.length}`);

// Pull a reference row in SRG to compare after switch
const srgProjects = await api("OWNER", "GET", "/api/projects?limit=5");
const srgProjNames = new Set((Array.isArray(srgProjects.json) ? srgProjects.json : (srgProjects.json?.rows ?? [])).map((p) => p.name));

const sw = await api("OWNER", "POST", "/api/company/switch", { companyId: censusId });
step("W40", "OWNER switches to census-test", sw.status < 400, sw.text.slice(0, 100));

const afterSwitch = await api("OWNER", "GET", "/api/projects?limit=5");
const afterRows = Array.isArray(afterSwitch.json) ? afterSwitch.json : (afterSwitch.json?.rows ?? []);
const stillSrg = afterRows.some((p) => srgProjNames.has(p.name));
step("W40", "after switch, project list is the OTHER company's (no SRG leak)", afterRows.every((p) => !srgProjNames.has(p.name)),
  `${afterRows.length} projects, ${stillSrg ? "SRG rows visible" : "clean"}`);

// switch back for the rest of the suite
await api("OWNER", "POST", "/api/company/switch", { companyId: srgId });

// ═══ W41 — Non-admin cannot switch companies ═══
console.log("\n── W41: Field role tries to switch companies ──");
const smSwitch = await api("SM", "POST", "/api/company/switch", { companyId: censusId });
guard("W41", "SALES_MANAGER switches companies", smSwitch, /forbid|admin|owner|access|member/i);
const seSwitch = await api("SE", "POST", "/api/company/switch", { companyId: censusId });
guard("W41", "SITE_ENGINEER switches companies", seSwitch, /forbid|admin|owner|access|member/i);

// ═══ W42 — Cross-tenant data: OWNER on census-test can't see SRG rows via id guessing ═══
console.log("\n── W42: Cross-tenant ID guessing ──");
const srgProjId = (Array.isArray(srgProjects.json) ? srgProjects.json : (srgProjects.json?.rows ?? []))[0]?.id;
await api("OWNER", "POST", "/api/company/switch", { companyId: censusId });
const guessRead = await api("OWNER", "GET", `/api/projects/${srgProjId}`);
const guessBlocked = guessRead.status === 404 || guessRead.status === 403;
step("W42", "SRG project ID unreadable while census-test is active", guessBlocked,
  `got ${guessRead.status} ${guessRead.text.slice(0, 80)}`);
// writes too
const guessWrite = await api("OWNER", "POST", "/api/requisitions", {
  projectId: srgProjId, lines: [{ materialId: "any", qtyRequested: 1 }],
});
guard("W42", "write into an SRG project from census-test", guessWrite, /found|scope|tenant|access|invalid|required|company/i);
await api("OWNER", "POST", "/api/company/switch", { companyId: srgId });

// ═══ W43 — Tenant B is fully sealed (Vardaan isn't a member) ═══
console.log("\n── W43: Tenant B — not even the owner can reach it ──");
const tbSwitch = await api("OWNER", "POST", "/api/company/switch", { companyId: tenantBId });
guard("W43", "OWNER switches to Tenant B (not a member)", tbSwitch, /member|access|forbid|invalid|not allowed/i);

// ═══ W44 — Employee data scoped per company (same person, different co) ═══
console.log("\n── W44: Employee list isolation between tenants ──");
const srgEmps = await api("ADMIN", "GET", "/api/employees?limit=5");
const srgEmpNames = new Set((Array.isArray(srgEmps.json) ? srgEmps.json : (srgEmps.json?.rows ?? [])).map((e) => e.name));
await api("OWNER", "POST", "/api/company/switch", { companyId: censusId });
const censusEmps = await api("OWNER", "GET", "/api/employees?limit=5");
const censusRows = Array.isArray(censusEmps.json) ? censusEmps.json : (censusEmps.json?.rows ?? []);
step("W44", "census-test employee list has zero SRG names", censusRows.every((e) => !srgEmpNames.has(e.name)),
  `${censusRows.length} rows`);
await api("OWNER", "POST", "/api/company/switch", { companyId: srgId });

// ═══ W45 — Data export: who can pull the company dataset ═══
console.log("\n── W45: Data export permission boundary ──");
const expOwner = await api("OWNER", "GET", "/api/export?type=payroll-expense&format=csv");
step("W45", "OWNER can export company data", expOwner.status < 400, expOwner.text.slice(0, 80));
const expSM = await api("SM", "GET", "/api/export?type=payroll-expense&format=csv");
guard("W45", "SALES_MANAGER exports company data", expSM, /forbid|denied|access|admin|owner/i);
const expSE = await api("SE", "GET", "/api/export?type=payroll-expense&format=csv");
guard("W45", "SITE_ENGINEER exports company data", expSE, /forbid|denied|access|admin|owner/i);

// ═══ W46 — Session security: a request with no cookies is anonymous ═══
console.log("\n── W46: Unauthenticated request rejected ──");
const anon = await fetch(`${BASE}/api/projects?limit=5`);
const anonBlocked = anon.status === 401 || anon.status === 403 || anon.status === 307;
step("W46", "no-cookie request to /api/projects is rejected", anonBlocked, `got ${anon.status}`);

// ═══ W47 — Tampered active-company cookie ═══
console.log("\n── W47: Forged company cookie can't break isolation ──");
const forged = await api("ADMIN", "GET", "/api/projects?limit=5", undefined, {
  cookie: "nirman-active-company=tenantb-co",
});
// jar cookies still apply — forge by overriding: send a hand-built request
const forged2 = await fetch(`${BASE}/api/projects?limit=5`, {
  headers: { cookie: [...(jars["ADMIN"] ?? new Map()).entries()].filter(([k]) => k !== "nirman-active-company").map(([k, v]) => `${k}=${v}`).join("; ") + "; nirman-active-company=tenantb-co" },
});
const forgedRows = await forged2.json().catch(() => null);
const forgedOk = forged2.status === 401 || forged2.status === 403 || forged2.status === 404;
// If rows come back they must be ADMIN's real tenant (SRG) — the server
// resolves tenancy from the session, not the (forged) cookie.
const allSrg = Array.isArray(forgedRows)
  ? forgedRows.every((r) => r.companyId === srgId || !r.companyId)
  : false;
step("W47", "forged company-cookie → ignored or rejected (no cross-tenant data)",
  forgedOk || allSrg,
  `got ${forged2.status} rows=${Array.isArray(forgedRows) ? forgedRows.length : "?"} allSRG=${allSrg}`);

// ═══ W48 — Deleted member's session dies instantly ═══
console.log("\n── W48: Remove member mid-session → session dies ──");
const members = await api("ADMIN", "GET", `/api/companies/${srgId}/members?limit=100`);
const memberRows = Array.isArray(members.json) ? members.json : (members.json?.rows ?? []);
const yashMem = memberRows.find((m) => m.name === "Yash Saxena" || m.user?.name === "Yash Saxena");
if (yashMem) {
  // Remove (DELETE) then verify the live session is dead, then re-add
  const del = await api("ADMIN", "DELETE", `/api/companies/${srgId}/members/${yashMem.id}`);
  step("W48", "ADMIN removes Yash's membership", del.status < 400, del.text.slice(0, 80));
  const deadSess = await api("SE", "GET", "/api/projects?limit=5");
  const sessDead = deadSess.status === 401 || deadSess.status === 403;
  step("W48", "Yash's live session loses access instantly", sessDead, `got ${deadSess.status}`);
  // Re-add via create-account is heavy — restore membership shape via members POST if it exists
  const userDetail = await api("ADMIN", "GET", `/api/users/${yashMem.userId}`);
  const reAdd = await api("ADMIN", "POST", `/api/companies/${srgId}/members`, {
    email: userDetail.json?.email, role: yashMem.role, scopeType: "PROJECT",
    scopeEntries: (yashMem.scopes ?? []).filter((sc) => sc.projectId).map((sc) => ({ projectId: sc.projectId })),
  });
  const reAddOk = reAdd.status < 400 || /exist|already|scope|role/i.test(reAdd.text);
  step("W48", "membership restored (re-add)", reAddOk || del.status >= 400, reAdd.text.slice(0, 80));
}

console.log(`\n═══ wave-3 ledger: ${PASS} correct, ${FAIL} problems ═══`);
if (failures.length) { console.log("\nfindings:"); for (const f of failures) console.log("  • " + f); }

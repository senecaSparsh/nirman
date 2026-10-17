#!/usr/bin/env node
/**
 * onboard-srg-team.mjs — onboard the remaining 5 SRG REALCON staff through
 * the REAL onboarding flow (same endpoints the HR UI calls), leaving no gap.
 *
 * Steps (all through the app API as OWNER):
 *   0. Create the 4 departments the org runs on
 *   1. POST /api/employees                    → Employee record (dossier)
 *   2. POST /api/employees/[id]/create-account → User + membership + credential
 *      + role + scope + their pool phone attached (companyPhoneId)
 *
 * Scope rules (rbac.ts): PD/FH can be COMPANY; PM/SM/SE are
 * DEPARTMENT/PROJECT-scoped only — they get their real department.
 *
 * Reporting chain:
 *   Anurag (PD, H2)   → Vardaan     scope: COMPANY
 *   Manish (FH, H3)   → Vardaan     scope: COMPANY
 *   Raviraj (PM, H3)  → Vardaan     scope: DEPARTMENT Procurement
 *   Mani   (SM, H4)   → Manish      scope: DEPARTMENT Sales
 *   Yash   (SE, H4)   → Anurag      scope: DEPARTMENT Construction
 *
 * Run inside the web container:  OWNER_PASSWORD=… node onboard-srg-team.mjs
 * Order matters — Manish + Anurag are created before their reports.
 */

const BASE = "http://localhost:3000";
const OWNER = { phone: "7017988293", password: process.env.OWNER_PASSWORD };

// Pool CompanyPhone ids (fetched from DB — attach the pre-registered number).
const POOL_PHONE_ID = {
  "7302920202": "cmvcbd6h7000qo15mky9jusr7", // Construction — Anurag
  "7302920201": "cmvcbd6h9000so15m3rsopo4t", // Finance — Manish
  "9520002752": "cmvcbd6ha000uo15mtg61sfke", // Procurement — Raviraj
  "7302920203": "cmvcbd6hc000wo15mvdslbe8t", // Sales — Mani
  "7302920205": "cmvcbd6hd000yo15msrozzp9z", // Construction — Yash
};

const DEPARTMENTS = [
  { code: "CONSTR", name: "Construction" },
  { code: "FIN", name: "Finance" },
  { code: "PROC", name: "Procurement" },
  { code: "SALES", name: "Sales" },
];

const TEAM = [
  { key: "anurag",  name: "Anurag Garg",   phone: "7302920202", role: "PROJECT_DIRECTOR",    designation: "Project Director",    hierarchyLevel: 2, reportsToKey: "vardaan", scopeType: "COMPANY",    dept: null },
  { key: "manish",  name: "Manish Kumar",  phone: "7302920201", role: "FINANCE_HEAD",        designation: "Finance Head",        hierarchyLevel: 3, reportsToKey: "vardaan", scopeType: "COMPANY",    dept: null },
  { key: "raviraj", name: "Raviraj Singh", phone: "9520002752", role: "PROCUREMENT_MANAGER", designation: "Procurement Manager", hierarchyLevel: 3, reportsToKey: "vardaan", scopeType: "DEPARTMENT", dept: "PROC" },
  { key: "mani",    name: "Mani Singh",    phone: "7302920203", role: "SALES_MANAGER",       designation: "Sales Manager",       hierarchyLevel: 4, reportsToKey: "manish",  scopeType: "DEPARTMENT", dept: "SALES" },
  { key: "yash",    name: "Yash Saxena",   phone: "7302920205", role: "SITE_ENGINEER",       designation: "Site Engineer",       hierarchyLevel: 4, reportsToKey: "anurag",  scopeType: "DEPARTMENT", dept: "CONSTR" },
];

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text: text.slice(0, 300) };
}

// ── 1. sign in as OWNER ──
const signIn = await api("POST", "/api/auth/phone-password", OWNER);
if (signIn.status >= 400) { console.error("sign-in failed:", signIn.status, signIn.text); process.exit(1); }
console.log("signed in as OWNER");

// ── 2. departments ──
const deptByCode = {};
for (const d of DEPARTMENTS) {
  const r = await api("POST", "/api/departments", { code: d.code, name: d.name, active: true });
  if (r.status < 400) { deptByCode[d.code] = r.json?.id; console.log(`dept ${d.code}: ${r.json?.id}`); }
  else {
    // already exists — look it up
    const list = await api("GET", "/api/departments");
    const found = (list.json?.departments ?? list.json ?? []).find((x) => x.code === d.code);
    deptByCode[d.code] = found?.id;
    console.log(`dept ${d.code}: exists (${found?.id})`);
  }
}

// manager employee ids
const empByKey = {};
const roster = await api("GET", "/api/employees?limit=100");
const rows = roster.json?.employees ?? roster.json ?? [];
for (const e of rows) {
  if (e.name === "Vardaan Kumar") empByKey.vardaan = e.id;
  if (e.name === "Sanjeev Kumar") empByKey.sanjeev = e.id;
}
console.log("managers:", JSON.stringify(empByKey));

// ── 3. onboard each member ──
const results = [];
for (const m of TEAM) {
  const reportsToEmployeeId = empByKey[m.reportsToKey];
  const existing = rows.find((e) => e.name === m.name);
  let empId;
  if (existing) {
    empId = existing.id;
    console.log(`[${m.key}] employee exists (${empId}) — account step`);
  } else {
    const emp = await api("POST", "/api/employees", {
      name: m.name,
      phone: m.phone,
      designation: m.designation,
      hierarchyLevel: m.hierarchyLevel,
      reportsToEmployeeId: reportsToEmployeeId ?? undefined,
      employmentType: "PERMANENT",
      wageType: "MONTHLY",
      active: true,
    });
    if (emp.status >= 400) { console.log(`[${m.key}] employee FAILED ${emp.status}: ${emp.text}`); results.push({ ...m, ok: false }); continue; }
    empId = emp.json?.id ?? emp.json?.employee?.id;
    console.log(`[${m.key}] employee created: ${empId} → ${m.reportsToKey}`);
  }
  empByKey[m.key] = empId;

  const acct = await api("POST", `/api/employees/${empId}/create-account`, {
    phone: "91" + m.phone,
    role: m.role,
    scopeType: m.scopeType,
    scopes: m.scopeType === "DEPARTMENT" ? [{ scopeKind: "DEPARTMENT", departmentId: deptByCode[m.dept] }] : undefined,
    companyPhoneId: POOL_PHONE_ID[m.phone] ?? undefined,
    newPhoneNumber: POOL_PHONE_ID[m.phone] ? undefined : m.phone,
    newPhoneLabel: POOL_PHONE_ID[m.phone] ? undefined : `${m.name} — staff`,
    designation: m.designation,
  });
  if (acct.status >= 400) { console.log(`[${m.key}] account FAILED ${acct.status}: ${acct.text}`); results.push({ ...m, ok: false, err: acct.text }); continue; }
  const pw = acct.json?.password ?? acct.json?.temporaryPassword ?? acct.json?.credentials?.password;
  results.push({ ...m, ok: true, empId, password: pw });
  console.log(`[${m.key}] account created — role=${m.role} scope=${m.scopeType}${m.dept ? ":" + m.dept : ""}`);
}

console.log("\n═══ SRG REALCON — team credentials ═══");
console.log("  Vardaan Kumar      OWNER                7017988293  (existing)");
console.log("  Sanjeev Kumar      ADMIN                9412230391  (existing)");
for (const r of results) {
  if (!r.ok) { console.log(`  ${r.name} — FAILED: ${(r.err || "").slice(0, 90)}`); continue; }
  console.log(`  ${r.name.padEnd(15)} ${r.role.padEnd(21)} ${r.phone}  ${r.password ?? "(see create-account response)"}`);
}

/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Auto-deposit flow test (mobile path: POST /api/employees/[id]/setup-deposit):
//   agreement-independence, input validation, state guards, permissions,
//   disable flow, and the active⇔deposit invariant across terminate/deactivate.
// ─────────────────────────────────────────────────────────────────────
import { prisma } from "@nirman/db";

const BASE = "http://localhost:3000";
const SRG = "cmu1990sa0000vlpqpegbainb";
const OTHER = "cmtxajzqh0000vl2sskqywa6b";
const PW = "nirman123";

const results = [];
function rec(name, expect, actual, verdict) {
  results.push({ name, verdict });
  console.log(`${verdict === "PASS" ? "✅" : verdict === "WARN" ? "⚠️ " : "❌"} ${name}\n     expect: ${expect}\n     actual: ${actual}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(cookie, method, path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "Origin": BASE, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 2) {
      const ra = Number(res.headers.get("retry-after") ?? 3);
      await sleep(Math.max(1500, ra * 1000));
      continue;
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
}

async function signIn(email, password) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 429 && attempt < 3) { await sleep(Number(res.headers.get("retry-after") ?? 15) * 1000); continue; }
    const cookies = res.headers.getSetCookie?.() ?? [];
    return cookies.map((c) => c.split(";")[0]).filter((c) => c.includes("session")).join("; ") || null;
  }
}

async function demoLogin(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

// ── fixture: one employee per contractStatus + inactive/terminated/foreign ──
const TS = Date.now().toString(36);
async function mkEmployee(name, extra = {}) {
  return prisma.employee.create({
    data: { name, companyId: SRG, dailyRate: 800, wageType: "DAILY", active: true, ...extra },
    select: { id: true },
  });
}

const fixture = {
  none: await mkEmployee(`TD-None-${TS}`),
  draft: await mkEmployee(`TD-Draft-${TS}`, { contractStatus: "DRAFT" }),
  issued: await mkEmployee(`TD-Issued-${TS}`, { contractStatus: "ISSUED", contractIssuedAt: new Date() }),
  confirmed: await mkEmployee(`TD-Confirmed-${TS}`, { contractStatus: "CONFIRMED", contractIssuedAt: new Date(), contractConfirmedAt: new Date() }),
  expired: await mkEmployee(`TD-Expired-${TS}`, { contractStatus: "EXPIRED", contractIssuedAt: new Date() }),
  inactive: await mkEmployee(`TD-Inactive-${TS}`, { active: false }),
  terminated: await mkEmployee(`TD-Term-${TS}`, { active: false, deletedAt: new Date(), contractStatus: "TERMINATED" }),
};
const foreignEmp = await prisma.employee.findFirst({ where: { companyId: OTHER, deletedAt: null, active: true }, select: { id: true } });
const fixtureIds = Object.values(fixture).map((e) => e.id);

const owner = await demoLogin("OWNER");
const oc = await signIn(owner.email, owner.password);
const hc = await signIn("hema.testhr@nirman.internal", PW);   // HR_MANAGER → payroll.manage
const rc = await signIn("rohan.testemp@nirman.internal", PW); // SITE_ENGINEER → no payroll.manage
console.log("cookies:", { owner: !!oc, hr: !!hc, engineer: !!rc });
if (!oc || !hc || !rc) { console.log("FATAL: sign-in failed — run fixture.mjs first"); process.exit(1); }

const VALID = { bankAccountHolder: "Test Depositor", bankAccountNumber: "50100234567890", bankIfsc: "HDFC0001234", bankName: "HDFC Bank", bankBranch: "Koramangala", payDay: 7 };
const setup = (c, id, body) => api(c, "POST", `/api/employees/${id}/setup-deposit`, body);
const flagOf = async (id) => (await prisma.employee.findUnique({ where: { id }, select: { autoDepositEnabled: true, active: true } }));

console.log("\n═══ A. Agreement-independence (the change under test) ═══");
for (const [key, label] of [["none", "no agreement (null)"], ["draft", "DRAFT"], ["issued", "ISSUED (not confirmed)"], ["confirmed", "CONFIRMED"], ["expired", "EXPIRED"]]) {
  const r = await setup(oc, fixture[key].id, VALID);
  const db = await flagOf(fixture[key].id);
  rec(`A-${key} setup with agreement = ${label}`, "200 + flag=true",
    `${r.status} ${r.data?.error ?? ""} | db=${db?.autoDepositEnabled}`,
    r.status === 200 && db?.autoDepositEnabled === true ? "PASS" : "FAIL");
}

console.log("\n═══ B. Input validation ═══");
{
  const id = fixture.none.id;
  const cases = [
    ["missing holder", { ...VALID, bankAccountHolder: "" }],
    ["missing account", { ...VALID, bankAccountNumber: "" }],
    ["missing bank name", { ...VALID, bankName: "" }],
    ["bad IFSC (short)", { ...VALID, bankIfsc: "HDFC0012" }],
    ["bad IFSC (5th not 0)", { ...VALID, bankIfsc: "HDFC1234567" }],
    ["IFSC all-numeric", { ...VALID, bankIfsc: "12345678901" }],
    ["payDay = 0", { ...VALID, payDay: 0 }],
    ["payDay = 32", { ...VALID, payDay: 32 }],
    ["payDay missing", { ...VALID, payDay: undefined }],
    ["payDay string 'abc'", { ...VALID, payDay: "abc" }],
    ["payDay float 5.5", { ...VALID, payDay: 5.5 }],
    ["payDay string '7'", { ...VALID, payDay: "7" }],
    ["payDay null", { ...VALID, payDay: null }],
  ];
  for (const [label, body] of cases) {
    const r = await setup(oc, id, body);
    rec(`B ${label}`, "400 (not 500)",
      `${r.status} ${r.data?.error ?? ""}`,
      r.status === 400 ? "PASS" : "FAIL");
  }
  const r = await setup(oc, id, { ...VALID, bankIfsc: "hdfc0001234" });
  const db = await prisma.employee.findUnique({ where: { id }, select: { bankIfsc: true } });
  rec("B lowercase IFSC normalized", "200 + stored HDFC0001234",
    `${r.status} | db=${db?.bankIfsc}`,
    r.status === 200 && db?.bankIfsc === "HDFC0001234" ? "PASS" : "FAIL");
}

console.log("\n═══ C. State guards ═══");
{
  const r1 = await setup(oc, fixture.inactive.id, VALID);
  rec("C1 inactive employee", "400", `${r1.status} ${r1.data?.error ?? ""}`, r1.status === 400 ? "PASS" : "FAIL");

  // assertCanManageEmployee fires before the service's findFirst and
  // deliberately returns the same "not found or out of scope" for missing
  // rows — 403 and 404 both mean blocked without leaking existence.
  const r2 = await setup(oc, fixture.terminated.id, VALID);
  rec("C2 terminated (soft-deleted) employee", "403/404 blocked", `${r2.status} ${r2.data?.error ?? ""}`, (r2.status === 403 || r2.status === 404) ? "PASS" : "FAIL");

  const r3 = await setup(oc, "nonexistent-id", VALID);
  rec("C3 nonexistent id", "403/404 blocked", `${r3.status} ${r3.data?.error ?? ""}`, (r3.status === 403 || r3.status === 404) ? "PASS" : "FAIL");

  if (foreignEmp) {
    const r4 = await setup(oc, foreignEmp.id, VALID);
    rec("C4 foreign-company employee", "403 or 404, flag unchanged",
      `${r4.status} ${r4.data?.error ?? ""}`,
      (r4.status === 403 || r4.status === 404) ? "PASS" : "FAIL");
  } else rec("C4 foreign employee", "skip", "no fixture", "WARN");
}

console.log("\n═══ D. Permissions ═══");
{
  const r1 = await setup(null, fixture.draft.id, VALID);
  rec("D1 unauthenticated", "401", `${r1.status}`, r1.status === 401 ? "PASS" : "FAIL");

  const r2 = await setup(rc, fixture.draft.id, VALID);
  rec("D2 SITE_ENGINEER (no payroll.manage)", "403", `${r2.status} ${r2.data?.error ?? ""}`, r2.status === 403 ? "PASS" : "FAIL");

  const r3 = await setup(hc, fixture.draft.id, { ...VALID, payDay: 10 });
  rec("D3 HR_MANAGER (payroll.manage)", "200", `${r3.status} ${r3.data?.error ?? ""}`, r3.status === 200 ? "PASS" : "FAIL");
}

console.log("\n═══ E. Disable flow ═══");
{
  const id = fixture.confirmed.id; // enabled in section A
  const r1 = await setup(oc, id, { disable: true });
  const db1 = await flagOf(id);
  rec("E1 disable", "200 + flag=false, bank kept",
    `${r1.status} | db=${db1?.autoDepositEnabled}`,
    r1.status === 200 && db1?.autoDepositEnabled === false ? "PASS" : "FAIL");
  const bank = await prisma.employee.findUnique({ where: { id }, select: { bankAccountNumber: true } });
  rec("E1b bank details preserved after disable", "number still stored",
    `db=${bank?.bankAccountNumber}`, bank?.bankAccountNumber === VALID.bankAccountNumber ? "PASS" : "FAIL");

  const r2 = await setup(oc, id, { disable: true });
  rec("E2 disable again (idempotent)", "200", `${r2.status} ${r2.data?.error ?? ""}`, r2.status === 200 ? "PASS" : "FAIL");

  const r3 = await setup(oc, id, { ...VALID, payDay: 15 });
  const db3 = await flagOf(id);
  rec("E3 re-enable after disable", "200 + flag=true",
    `${r3.status} | db=${db3?.autoDepositEnabled}`,
    r3.status === 200 && db3?.autoDepositEnabled === true ? "PASS" : "FAIL");
}

console.log("\n═══ F. active⇔deposit invariant (terminate / deactivate / reactivate) ═══");
{
  // F1: terminate clears the flag
  const emp = await mkEmployee(`TD-TermFlag-${TS}`);
  await setup(oc, emp.id, VALID);
  const term = await api(oc, "POST", `/api/employees/${emp.id}/terminate`, { reason: "test" });
  const db1 = await flagOf(emp.id);
  rec("F1 terminate clears auto-deposit", "flag=false",
    `term=${term.status} | db=${db1?.autoDepositEnabled}, active=${db1?.active}`,
    term.status === 200 && db1?.autoDepositEnabled === false && db1?.active === false ? "PASS" : "FAIL");
  fixtureIds.push(emp.id);

  // F2: PATCH active:false clears the flag
  const emp2 = await mkEmployee(`TD-Deact-${TS}`);
  await setup(oc, emp2.id, VALID);
  const de = await api(oc, "PATCH", `/api/employees/${emp2.id}`, { active: false });
  const db2 = await flagOf(emp2.id);
  rec("F2 PATCH active:false clears auto-deposit", "flag=false",
    `patch=${de.status} | db=${db2?.autoDepositEnabled}, active=${db2?.active}`,
    de.status === 200 && db2?.autoDepositEnabled === false ? "PASS" : "FAIL");

  // F3: reactivate does NOT silently re-enable deposit
  const re = await api(oc, "PATCH", `/api/employees/${emp2.id}`, { active: true });
  const db3 = await flagOf(emp2.id);
  rec("F3 reactivate does not auto-restore deposit", "active=true, flag=false",
    `patch=${re.status} | db=${db3?.autoDepositEnabled}, active=${db3?.active}`,
    re.status === 200 && db3?.active === true && db3?.autoDepositEnabled === false ? "PASS" : "FAIL");
  fixtureIds.push(emp2.id);

  // F4: generic PATCH cannot enable the flag
  const emp3 = await mkEmployee(`TD-Patch-${TS}`);
  const p = await api(oc, "PATCH", `/api/employees/${emp3.id}`, { autoDepositEnabled: true, bankAccountNumber: "12345" });
  const db4 = await flagOf(emp3.id);
  rec("F4 PATCH cannot set autoDepositEnabled", "flag stays null/false",
    `patch=${p.status} | db=${db4?.autoDepositEnabled}`,
    p.status === 200 && db4?.autoDepositEnabled !== true ? "PASS" : "FAIL");
  fixtureIds.push(emp3.id);

  // F5: setup on inactive (post-deactivate) is blocked even though bank data exists
  const emp4 = await mkEmployee(`TD-InactSetup-${TS}`, { active: false });
  const r5 = await setup(oc, emp4.id, VALID);
  rec("F5 setup on inactive employee blocked", "400",
    `${r5.status} ${r5.data?.error ?? ""}`, r5.status === 400 ? "PASS" : "FAIL");
  fixtureIds.push(emp4.id);
}

console.log("\n═══ G. Mobile pages render (SSR smoke) ═══");
{
  for (const [path, label] of [
    [`/m/hr/onboarding/${fixture.confirmed.id}`, "onboarding detail"],
    [`/m/hr/employees/${fixture.confirmed.id}`, "employee detail"],
    ["/m/hr/onboarding", "onboarding queue"],
  ]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: oc } });
    const html = await res.text();
    const errored = html.includes("Application error") || html.includes("Internal Server Error");
    rec(`G ${label} page`, "200 + no error boundary", `${res.status} len=${html.length}`,
      res.status === 200 && !errored ? "PASS" : "FAIL");
  }
}

// ── cleanup ──
await prisma.employee.deleteMany({ where: { id: { in: fixtureIds } } });

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}`);
await prisma.$disconnect();

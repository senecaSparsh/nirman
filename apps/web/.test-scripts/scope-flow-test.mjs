/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Scope + reporting-line flow test (as OWNER):
//   project scope narrowing, department scope, company scope,
//   membership reportsTo + cycle prevention, cross-tenant entries.
// Real sessions via better-auth sign-in (no AUTH_BYPASS).
// ─────────────────────────────────────────────────────────────────────
import { prisma } from "@nirman/db";

const BASE = "http://localhost:3000";
const SRG = "cmu1990sa0000vlpqpegbainb";
const OTHER = "cmtxajzqh0000vl2sskqywa6b";
const PW = "nirman123";

const results = [];
function rec(name, expect, actual, verdict, detail = "") {
  results.push({ name, expect, actual, verdict, detail });
  const icon = verdict === "PASS" ? "✅" : verdict === "WARN" ? "⚠️ " : "❌";
  console.log(`${icon} ${name}\n     expect: ${expect}\n     actual: ${actual}${detail ? `\n     ${detail}` : ""}`);
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
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.map((c) => c.split(";")[0]).filter((c) => c.includes("session")).join("; ");
  if (!session) return { cookie: null, status: res.status, body: await res.text().catch(() => "") };
  return { cookie: session, status: res.status };
}

async function demoLogin(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

// ── Fixture IDs ──
const rohanUserId = "cmu71ujzx0005vleq9qjtot5p";
const rohanEmpId = "cmu71uk20000bvleqr2b6xt30";
const hemaUserId = "cmu71uk28000dvleqc4w8p270";
const qaDeptId = "cmu71ujzi0001vleqzir2p57o";
const projectA = "cmu1avili000evli4udrm9x4z"; // E2E-SRG-Tower A

const projectB = await prisma.project.findFirst({ where: { companyId: SRG, deletedAt: null, name: { contains: "Skyline" } }, select: { id: true, name: true } });
const foreignProject = await prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true, name: true } });
const foreignDept = await prisma.department.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true, name: true } });
const rohanMem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: rohanUserId, companyId: SRG } } });
const hemaMem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: hemaUserId, companyId: SRG } } });
const foreignMem = await prisma.userCompany.findFirst({ where: { companyId: OTHER }, select: { id: true } });

console.log("=== signing in ===");
const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const rc = (await signIn("rohan.testemp@nirman.internal", PW)).cookie;
console.log("owner cookie:", !!oc, "| rohan cookie:", !!rc);
if (!oc || !rc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const scope = (c, body) => api(c, "PATCH", `/api/users/${rohanUserId}/scope`, body);
const scopeHema = (c, body) => api(c, "PATCH", `/api/users/${hemaUserId}/scope`, body);
const getScope = (c, uid = rohanUserId) => api(c, "GET", `/api/users/${uid}/scope`);
const proj = (c, id) => api(c, "GET", `/api/projects/${id}`);

console.log("\n═══ A. Baseline scope ═══");
{
  const s = await getScope(oc);
  rec("A1 GET /api/users/[rohan]/scope",
    "200 + SITE_ENGINEER role",
    `${s.status} role=${s.data?.role} scopeType=${s.data?.scopeType}`,
    s.status === 200 && s.data?.role === "SITE_ENGINEER" ? "PASS" : "FAIL");
  const a1 = await proj(rc, projectA);
  const b1 = await proj(rc, projectB.id);
  rec("A2 rohan sees no projects (PROJECT scope, 0 entries)",
    "both 404",
    `A=${a1.status} B=${b1.status}`,
    a1.status === 404 && b1.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ B. PROJECT scope narrowing/widening ═══");
{
  const p = await scope(oc, { role: "SITE_ENGINEER", scopeType: "PROJECT", scopeEntries: [{ projectId: projectA }] });
  rec("B1 owner assigns PROJECT scope [A]",
    "200",
    `${p.status} ${p.data?.error ?? ""}`,
    p.status === 200 ? "PASS" : "FAIL");

  const s = await getScope(oc);
  rec("B2 GET scope reflects PROJECT + entry A",
    "scopeType=PROJECT, 1 entry",
    `scopeType=${s.data?.scopeType} entries=${s.data?.scopes?.length}`,
    s.data?.scopeType === "PROJECT" && s.data?.scopes?.length === 1 ? "PASS" : "FAIL");

  const a = await proj(rc, projectA);
  const b = await proj(rc, projectB.id);
  rec("B3 rohan sees A but not B",
    "A=200 B=404",
    `A=${a.status} B=${b.status}`,
    a.status === 200 && b.status === 404 ? "PASS" : "FAIL");

  const p2 = await scope(oc, { role: "SITE_ENGINEER", scopeType: "PROJECT", scopeEntries: [{ projectId: projectA }, { projectId: projectB.id }] });
  const b2 = await proj(rc, projectB.id);
  rec("B4 owner adds project B → rohan sees it",
    "patch 200, B=200",
    `patch=${p2.status} B=${b2.status}`,
    p2.status === 200 && b2.status === 200 ? "PASS" : "FAIL");
}

console.log("\n═══ C. DEPARTMENT scope ═══");
{
  const p = await scope(oc, { role: "SITE_ENGINEER", scopeType: "DEPARTMENT", scopeEntries: [{ departmentId: qaDeptId }] });
  rec("C1 owner assigns DEPARTMENT scope [QA-Test-Dept]",
    "200",
    `${p.status} ${p.data?.error ?? ""}`,
    p.status === 200 ? "PASS" : "FAIL");

  const s = await getScope(oc);
  rec("C2 GET scope reflects DEPARTMENT + dept entry",
    "scopeType=DEPARTMENT, dept=QA-Test-Dept",
    `scopeType=${s.data?.scopeType} dept=${s.data?.scopes?.[0]?.department?.name}`,
    s.data?.scopeType === "DEPARTMENT" && s.data?.scopes?.[0]?.department?.name === "QA-Test-Dept" ? "PASS" : "FAIL");

  const a1 = await proj(rc, projectA);
  const b1 = await proj(rc, projectB.id);
  rec("C3 rohan dept-scoped, no dept employees deployed → no projects",
    "A=404 B=404",
    `A=${a1.status} B=${b1.status}`,
    a1.status === 404 && b1.status === 404 ? "PASS" : "FAIL");

  // Deploy rohan's employee to project A — dept scope should then reveal it.
  const deploy = await api(oc, "PATCH", `/api/employees/${rohanEmpId}`, { activeProjectId: projectA });
  const a2 = await proj(rc, projectA);
  const b2 = await proj(rc, projectB.id);
  rec("C4 deploy employee to project A → dept-scoped rohan sees A only",
    "deploy 200, A=200 B=404",
    `deploy=${deploy.status} A=${a2.status} B=${b2.status}`,
    deploy.status === 200 && a2.status === 200 && b2.status === 404 ? "PASS" : "FAIL");

  const bad = await scope(oc, { role: "SITE_ENGINEER", scopeType: "DEPARTMENT", scopeEntries: [{ projectId: projectA }] });
  rec("C5 DEPARTMENT scope + projectId entry",
    "400 kind mismatch",
    `${bad.status} ${bad.data?.error ?? ""}`,
    bad.status === 400 ? "PASS" : "FAIL");

  const foreign = await scope(oc, { role: "SITE_ENGINEER", scopeType: "DEPARTMENT", scopeEntries: [{ departmentId: foreignDept.id }] });
  rec("C6 DEPARTMENT scope + foreign-company department",
    "reject",
    `${foreign.status} ${foreign.data?.error ?? ""}`,
    foreign.status === 404 || foreign.status === 400 ? "PASS" : "FAIL");
}

console.log("\n═══ D. COMPANY scope restores full access ═══");
{
  const p = await scope(oc, { role: "SITE_ENGINEER", scopeType: "COMPANY" });
  const a = await proj(rc, projectA);
  const b = await proj(rc, projectB.id);
  rec("D1 COMPANY scope → rohan sees all projects",
    "patch 200, A=200 B=200",
    `patch=${p.status} A=${a.status} B=${b.status}`,
    p.status === 200 && a.status === 200 && b.status === 200 ? "PASS" : "FAIL");
}

console.log("\n═══ E. Reporting line (membership reportsTo) ═══");
{
  const p = await scope(oc, {
    role: "SITE_ENGINEER", scopeType: "COMPANY",
    reportsToUserCompanyId: hemaMem.id,
  });
  const s = await getScope(oc);
  rec("E1 rohan reports to hema",
    "patch 200 + reportsTo set",
    `patch=${p.status} reportsTo=${s.data?.reportsToUserCompanyId === hemaMem.id}`,
    p.status === 200 && s.data?.reportsToUserCompanyId === hemaMem.id ? "PASS" : "FAIL");

  const self = await scope(oc, {
    role: "SITE_ENGINEER", scopeType: "COMPANY",
    reportsToUserCompanyId: rohanMem.id,
  });
  rec("E2 self-reporting rejected",
    "400 cycle/self",
    `${self.status} ${self.data?.error ?? ""}`,
    self.status === 400 ? "PASS" : "FAIL");

  const foreign = await scope(oc, {
    role: "SITE_ENGINEER", scopeType: "COMPANY",
    reportsToUserCompanyId: foreignMem.id,
  });
  rec("E3 reportsTo another company's membership",
    "400 same-company check",
    `${foreign.status} ${foreign.data?.error ?? ""}`,
    foreign.status === 400 ? "PASS" : "FAIL");

  // Cycle: rohan→hema already set. Now hema→rohan should be refused.
  const cyc = await scopeHema(oc, {
    role: "HR_MANAGER", scopeType: "COMPANY",
    reportsToUserCompanyId: rohanMem.id,
  });
  const hemaAfter = await getScope(oc, hemaUserId);
  const cycleCreated = hemaAfter.data?.reportsToUserCompanyId === rohanMem.id;
  rec("E4 hema→rohan while rohan→hema (real cycle)",
    "400 cycle rejected",
    `${cyc.status} ${cyc.data?.error ?? ""} | cycleWritten=${cycleCreated}`,
    cyc.status === 400 && !cycleCreated ? "PASS" : "FAIL");

  // False-cycle probe: rohan→hema is set; a THIRD member reporting to hema
  // is fine (no cycle) — use vardaan's membership as the candidate manager.
  const vardaanMem = await prisma.userCompany.findFirst({ where: { companyId: SRG, role: "OWNER" }, select: { id: true } });
  const ok = await scopeHema(oc, {
    role: "HR_MANAGER", scopeType: "COMPANY",
    reportsToUserCompanyId: vardaanMem.id,
  });
  rec("E5 hema→owner (no cycle) allowed",
    "200",
    `${ok.status} ${ok.data?.error ?? ""}`,
    ok.status === 200 ? "PASS" : "FAIL");
}

console.log("\n═══ F. Cross-tenant + invalid entries ═══");
{
  const foreign = await scope(oc, { role: "SITE_ENGINEER", scopeType: "PROJECT", scopeEntries: [{ projectId: foreignProject.id }] });
  rec("F1 PROJECT scope + foreign project",
    "404/400",
    `${foreign.status} ${foreign.data?.error ?? ""}`,
    foreign.status === 404 || foreign.status === 400 ? "PASS" : "FAIL");

  const none = await scope(oc, { role: "SITE_ENGINEER", scopeType: "PROJECT", scopeEntries: [{ projectId: "no-such-project-id" }] });
  rec("F2 PROJECT scope + nonexistent project",
    "404/400",
    `${none.status} ${none.data?.error ?? ""}`,
    none.status === 404 || none.status === 400 ? "PASS" : "FAIL");

  const empty = await scope(oc, { role: "SITE_ENGINEER", scopeType: "PROJECT", scopeEntries: [] });
  rec("F3 PROJECT scope + zero entries",
    "400",
    `${empty.status} ${empty.data?.error ?? ""}`,
    empty.status === 400 ? "PASS" : "FAIL");

  const comp = await scope(oc, { role: "SITE_ENGINEER", scopeType: "COMPANY", scopeEntries: [{ projectId: projectA }] });
  rec("F4 COMPANY scope + entries",
    "400",
    `${comp.status} ${comp.data?.error ?? ""}`,
    comp.status === 400 ? "PASS" : "FAIL");

  const garbage = await scope(oc, { role: "SITE_ENGINEER", scopeType: "GARBAGE" });
  rec("F5 garbage scopeType",
    "400",
    `${garbage.status} ${garbage.data?.error ?? ""}`,
    garbage.status === 400 ? "PASS" : "FAIL");

  const badRole = await scope(oc, { role: "GARBAGE_ROLE_X", scopeType: "COMPANY" });
  rec("F6 garbage role string",
    "400",
    `${badRole.status} ${badRole.data?.error ?? ""}`,
    badRole.status === 400 ? "PASS" : "FAIL");
}

console.log("\n═══ cleanup ═══");
{
  // Restore rohan: SITE_ENGINEER, COMPANY scope cleared to original state
  // (scopeType null → PROJECT default, 0 entries, no reportsTo, no active project).
  const p = await api(oc, "PATCH", `/api/users/${rohanUserId}/scope`, {
    role: "SITE_ENGINEER", scopeType: "PROJECT",
    scopeEntries: [{ projectId: projectA }],
    reportsToUserCompanyId: null,
  });
  const clearScope = await prisma.userCompany.update({
    where: { userId_companyId: { userId: rohanUserId, companyId: SRG } },
    data: { scopeType: null, reportsToUserCompanyId: null },
  });
  await prisma.userScope.deleteMany({ where: { userCompanyId: rohanMem.id } });
  await prisma.userCompany.update({
    where: { userId_companyId: { userId: hemaUserId, companyId: SRG } },
    data: { reportsToUserCompanyId: null },
  });
  await prisma.employee.update({ where: { id: rohanEmpId }, data: { activeProjectId: null } });
  const after = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: rohanUserId, companyId: SRG } }, include: { scopes: true } });
  console.log(`restored rohan: role=${after.role} scopeType=${after.scopeType} scopes=${after.scopes.length} reportsTo=${after.reportsToUserCompanyId}`);
}

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}: ${r.actual}`);
await prisma.$disconnect();

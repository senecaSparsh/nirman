/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Employee department + role/permission change test (as OWNER),
// incl. custom roles, leak checks, and privilege-escalation probes.
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

// ── IDs from fixture ──
const rohanUserId = "cmu71ujzx0005vleq9qjtot5p";
const rohanEmpId = "cmu71uk20000bvleqr2b6xt30";
const hemaUserId = "cmu71uk28000dvleqc4w8p270";
const qaDeptId = "cmu71ujzi0001vleqzir2p57o";
const foreignDeptId = "cmu71ujzr0003vleqi5ourq7p";
const foreignEmpId = "cmtxajzrp002uvl2s564tl4pa"; // Vinod Jadhav, My Company
const vardaanUserId = "cmu1990sf0002vlpqw5kcsgpa";
const vardaanEmpId = "cmu1990u00008vlpqfvda8idb";
const anuragUserId = "cmu1990vp000qvlpqpg7h7za7"; // PROJECT_DIRECTOR (tier 2 control)
const srgProjectId = "cmu1avili000evli4udrm9x4z";

// foreign project (My Company) for cross-tenant probes
const foreignProject = await prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true, name: true } });

console.log("=== signing in ===");
const ownerCreds = await demoLogin("OWNER");
const owner = await signIn(ownerCreds.email, ownerCreds.password);
const rohan = await signIn("rohan.testemp@nirman.internal", PW);
const hema = await signIn("hema.testhr@nirman.internal", PW);
console.log("owner cookie:", !!owner.cookie, "| rohan:", !!rohan.cookie, "| hema:", !!hema.cookie);
if (!owner.cookie || !rohan.cookie || !hema.cookie) { console.log("FATAL: sign-in failed", { owner: owner.status, rohan: rohan.status, hema: hema.status }); process.exit(1); }

// ═══════════════ PHASE A — OWNER: employee dept/hierarchy change ═══
console.log("\n═══ A. OWNER changes employee department/hierarchy ═══");

const before = await api(owner.cookie, "GET", `/api/employees/${rohanEmpId}`);
rec("A1 GET employee (before)", "200 + dept null", `${before.status} dept=${before.data?.departmentId} hier=${before.data?.hierarchyLevel}`,
  before.status === 200 ? "PASS" : "FAIL");

const p1 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { departmentId: qaDeptId });
const afterDept = await api(owner.cookie, "GET", `/api/employees/${rohanEmpId}`);
const rohanMeDept = await api(rohan.cookie, "GET", "/api/me");
rec("A2 PATCH departmentId → QA-Test-Dept", "200 + dept switched + user.department synced",
  `${p1.status} | GET dept=${afterDept.data?.departmentId} | /api/me dept="${rohanMeDept.data?.department}"`,
  p1.status === 200 && afterDept.data?.departmentId === qaDeptId && rohanMeDept.data?.department === "QA-Test-Dept" ? "PASS" : "FAIL");

const p2 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { departmentId: foreignDeptId });
const fcheck = await prisma.employee.findUnique({ where: { id: rohanEmpId }, select: { departmentId: true } });
rec("A3 PATCH departmentId → dept in ANOTHER company", "reject (400/403/404) — cross-tenant link",
  `${p2.status} ${p2.data?.error ?? "ok"} | DB dept=${fcheck?.departmentId}`,
  p2.status >= 400 ? "PASS" : "FAIL",
  p2.status < 400 ? "BUG: employee linked to a foreign tenant's department" : "");

const p3 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { departmentId: "dept_does_not_exist" });
rec("A4 PATCH departmentId → nonexistent id", "clean 4xx (not 500)",
  `${p3.status} ${p3.data?.error ?? "ok"}`,
  p3.status >= 400 && p3.status < 500 ? "PASS" : p3.status >= 500 ? "FAIL" : "FAIL",
  p3.status === 500 ? "P2025 → unhandled 500 + ErrorLog noise for a client input error" : "");

// restore dept
await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { departmentId: qaDeptId });

const p4 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { reportsToEmployeeId: rohanEmpId });
rec("A5 PATCH reportsTo → self", "400 (self-report blocked)", `${p4.status} ${p4.data?.error ?? "ok"}`, p4.status === 400 ? "PASS" : "FAIL");

const p5 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { reportsToEmployeeId: foreignEmpId });
const rtCheck = await prisma.employee.findUnique({ where: { id: rohanEmpId }, select: { reportsToEmployeeId: true } });
rec("A6 PATCH reportsTo → employee in ANOTHER company", "reject — cross-tenant reporting line",
  `${p5.status} ${p5.data?.error ?? "ok"} | DB reportsTo=${rtCheck?.reportsToEmployeeId}`,
  p5.status >= 400 ? "PASS" : "FAIL",
  p5.status < 400 ? "BUG: cross-tenant reporting line accepted" : "");
// cleanup any bad link
if (rtCheck?.reportsToEmployeeId === foreignEmpId) await prisma.employee.update({ where: { id: rohanEmpId }, data: { reportsToEmployeeId: null } });

const p6 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { hierarchyLevel: 6 });
const hCheck = await prisma.employee.findUnique({ where: { id: rohanEmpId }, select: { hierarchyLevel: true } });
rec("A7 PATCH hierarchyLevel → 6", "200 + H6", `${p6.status} | DB=${hCheck?.hierarchyLevel}`, p6.status === 200 && hCheck?.hierarchyLevel === 6 ? "PASS" : "FAIL");
await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { hierarchyLevel: 5 }); // restore

const p7 = await api(owner.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { activeProjectId: foreignProject?.id ?? "none" });
rec("A8 PATCH activeProjectId → foreign project", "reject (service validates company)", `${p7.status} ${p7.data?.error ?? "ok"}`, p7.status >= 400 ? "PASS" : "FAIL",
  foreignProject ? "" : "(no foreign project found — skipped)");

const p8 = await api(owner.cookie, "PATCH", `/api/employees/${foreignEmpId}`, { designation: "CrossTenant" });
rec("A9 PATCH employee in ANOTHER company", "404 (company filter)", `${p8.status} ${p8.data?.error ?? "ok"}`, p8.status === 404 ? "PASS" : "FAIL");

// ═══════════════ PHASE B — ROHAN before role change (baseline) ═══
console.log("\n═══ B. ROHAN baseline (SITE_ENGINEER, before role change) ═══");

const meBefore = await api(rohan.cookie, "GET", "/api/me");
rec("B1 GET /api/me", "role=SITE_ENGINEER, no qc.manage/users.manage/finance.view",
  `role=${meBefore.data?.role} ownRole=${meBefore.data?.ownRole} qc.manage=${meBefore.data?.permissions?.includes("qc.manage")} users.manage=${meBefore.data?.permissions?.includes("users.manage")} finance.view=${meBefore.data?.permissions?.includes("finance.view")}`,
  meBefore.data?.role === "SITE_ENGINEER" && !meBefore.data?.permissions?.includes("qc.manage") ? "PASS" : "FAIL");

const ncrBefore = await api(rohan.cookie, "POST", "/api/quality-control/ncr", { projectId: srgProjectId, title: "ROLETEST before", description: "probe" });
rec("B2 POST /api/quality-control/ncr (no qc.manage)", "403", `${ncrBefore.status} ${ncrBefore.data?.error ?? "ok"}`, ncrBefore.status === 403 ? "PASS" : "FAIL");

const projBefore = await api(rohan.cookie, "GET", `/api/projects/${srgProjectId}`);
rec("B3 GET /api/projects/[id] (unassigned SITE_ENGINEER)", "404 (project-scoped, no assignments)",
  `${projBefore.status}`, projBefore.status === 404 ? "PASS" : "WARN",
  projBefore.status === 200 ? "site engineer saw an unassigned project" : "");

const empRoster = await api(rohan.cookie, "GET", `/api/employees/${vardaanEmpId}`);
const sensitiveKeys = ["bankAccountNumber", "bankIfsc", "panNumber", "aadhaarNumber", "pfNumber", "esiNumber", "uan", "dailyRate", "monthlySalary", "contractToken", "offerToken", "permanentAddress"];
const leaked = sensitiveKeys.filter((k) => empRoster.data && k in empRoster.data);
rec("B4 GET /api/employees/{owner} as hr.view user", "roster subset — NO bank/govID/wage/token keys",
  `${empRoster.status} leaked keys: [${leaked.join(",") || "none"}]`,
  empRoster.status === 200 && leaked.length === 0 ? "PASS" : "FAIL",
  leaked.length ? `LEAK: ${leaked.join(",")}` : "");

const empList = await api(rohan.cookie, "GET", "/api/employees");
const rowsWithRate = (empList.data ?? []).filter((e) => e.dailyRate !== null || e.monthlySalary !== null);
rec("B5 GET /api/employees list wage redaction", "dailyRate/monthlySalary null on all rows",
  `${empList.status} rows=${empList.data?.length} rows-with-wages=${rowsWithRate.length}`,
  empList.status === 200 && rowsWithRate.length === 0 ? "PASS" : "FAIL");

// ═══════════════ PHASE C — OWNER: custom roles ═══
console.log("\n═══ C. OWNER custom-role lifecycle ═══");

const cr1 = await api(owner.cookie, "POST", "/api/custom-roles", { key: "SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", permissions: ["qc.manage", "gate_pass.approve"] });
rec("C1 POST /api/custom-roles SITE_LEAD (base SITE_ENGINEER + qc.manage + gate_pass.approve)", "200",
  `${cr1.status} ${cr1.data?.error ?? cr1.data?.role?.key ?? "ok"}`, cr1.status === 200 ? "PASS" : "FAIL");

const cr2 = await api(owner.cookie, "POST", "/api/custom-roles", { key: "BOSS", label: "Boss", baseRole: "OWNER", permissions: [] });
rec("C2 POST custom-roles baseRole=OWNER", "403 (can't template on own role)", `${cr2.status} ${cr2.data?.error ?? "ok"}`, cr2.status === 403 ? "PASS" : "FAIL");

const cr3 = await api(owner.cookie, "POST", "/api/custom-roles", { key: "T1", label: "Tier One", baseRole: "SITE_ENGINEER", tier: 1, permissions: [] });
rec("C3 POST custom-roles tier=1", "403 (tier ≥ own blocked)", `${cr3.status} ${cr3.data?.error ?? "ok"}`, cr3.status === 403 ? "PASS" : "FAIL");

const cr4 = await api(owner.cookie, "POST", "/api/custom-roles", { key: "BADPERM", label: "Bad", baseRole: "SITE_ENGINEER", permissions: ["not.a.perm"] });
rec("C4 POST custom-roles bogus permission", "400", `${cr4.status} ${cr4.data?.error ?? "ok"}`, cr4.status === 400 ? "PASS" : "FAIL");

const cr5 = await api(owner.cookie, "POST", "/api/custom-roles", { key: "DIRECTOR", label: "Test Director", baseRole: "PROJECT_DIRECTOR", permissions: [] });
rec("C5 POST custom-roles DIRECTOR (tier 2, for escalation probes)", "200", `${cr5.status} ${cr5.data?.error ?? cr5.data?.role?.key ?? "ok"}`, cr5.status === 200 ? "PASS" : "FAIL");

// role assignment
const ra1 = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "CUSTOM_SITE_LEAD" });
const dbAfterAssign = await prisma.user.findUnique({ where: { id: rohanUserId }, select: { role: true } });
const memAfterAssign = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: rohanUserId, companyId: SRG } }, select: { role: true } });
rec("C6 PATCH users role → CUSTOM_SITE_LEAD", "200 + User.role & UserCompany.role both synced",
  `${ra1.status} | User.role=${dbAfterAssign?.role} Member.role=${memAfterAssign?.role}`,
  ra1.status === 200 && dbAfterAssign?.role === "CUSTOM_SITE_LEAD" && memAfterAssign?.role === "CUSTOM_SITE_LEAD" ? "PASS" : "FAIL");

const ra2 = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "OWNER" });
const stillCustom = await prisma.user.findUnique({ where: { id: rohanUserId }, select: { role: true } });
rec("C7 PATCH users role → OWNER (self-clone)", "403 + unchanged", `${ra2.status} ${ra2.data?.error ?? "ok"} | role=${stillCustom?.role}`,
  ra2.status === 403 && stillCustom?.role === "CUSTOM_SITE_LEAD" ? "PASS" : "FAIL");

const ra3 = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "CUSTOM_DOESNOTEXIST" });
rec("C8 PATCH users role → nonexistent CUSTOM_*", "403/400", `${ra3.status} ${ra3.data?.error ?? "ok"}`, ra3.status >= 400 ? "PASS" : "FAIL");

const ra4 = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "GARBAGE_ROLE_XYZ" });
const garbageCheck = await prisma.user.findUnique({ where: { id: rohanUserId }, select: { role: true } });
rec("C9 PATCH users role → arbitrary string 'GARBAGE_ROLE_XYZ'", "400 (role enum validation)",
  `${ra4.status} ${ra4.data?.error ?? "ok"} | User.role=${garbageCheck?.role}`,
  ra4.status === 400 ? "PASS" : "FAIL",
  ra4.status === 200 ? "BUG: garbage role written to DB; silently resolves as SUPERVISOR" : "");
// restore
await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "CUSTOM_SITE_LEAD" });

const ra5 = await api(owner.cookie, "PATCH", `/api/users/${vardaanUserId}`, { role: "ADMIN" });
rec("C10 PATCH own role (owner self-edit)", "blocked (400 self-guard or 403 tier-guard)", `${ra5.status} ${ra5.data?.error ?? "ok"}`, (ra5.status === 400 || ra5.status === 403) ? "PASS" : "FAIL");

const up1 = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}/permissions`, { permissions: ["finance.view"] });
const permCheck = await api(owner.cookie, "GET", `/api/users/${rohanUserId}/permissions`);
rec("C11 PATCH users/{id}/permissions +finance.view", "200 + effective ∋ finance.view,qc.manage,gate_pass.approve",
  `${up1.status} | effective has finance.view=${permCheck.data?.effective?.includes("finance.view")} qc.manage=${permCheck.data?.effective?.includes("qc.manage")} gate_pass.approve=${permCheck.data?.effective?.includes("gate_pass.approve")} | role=${permCheck.data?.role}`,
  up1.status === 200 && permCheck.data?.effective?.includes("finance.view") && permCheck.data?.effective?.includes("qc.manage") ? "PASS" : "FAIL");

// ═══════════════ PHASE D — ROHAN after role change ═══
console.log("\n═══ D. ROHAN after CUSTOM_SITE_LEAD + finance.view override ═══");

const meAfter = await api(rohan.cookie, "GET", "/api/me");
const mePerms = meAfter.data?.permissions ?? [];
rec("D1 GET /api/me after role change",
  "role=CUSTOM_SITE_LEAD, ownRole=SITE_ENGINEER, perms ∋ qc.manage+finance.view, ⊅ users.manage/hr.manage/payroll.manage",
  `role=${meAfter.data?.role} ownRole=${meAfter.data?.ownRole} | qc.manage=${mePerms.includes("qc.manage")} finance.view=${mePerms.includes("finance.view")} users.manage=${mePerms.includes("users.manage")} hr.manage=${mePerms.includes("hr.manage")} payroll.manage=${mePerms.includes("payroll.manage")}`,
  meAfter.data?.role === "CUSTOM_SITE_LEAD" && mePerms.includes("qc.manage") && mePerms.includes("finance.view") && !mePerms.includes("users.manage") && !mePerms.includes("hr.manage") ? "PASS" : "FAIL");

const ncrAfter = await api(rohan.cookie, "POST", "/api/quality-control/ncr", { projectId: srgProjectId, title: "ROLETEST after", description: "probe" });
rec("D2 POST /api/quality-control/ncr (qc.manage via custom role)", "201", `${ncrAfter.status} ${ncrAfter.data?.error ?? ncrAfter.data?.ncrNumber ?? "ok"}`,
  ncrAfter.status === 201 ? "PASS" : "FAIL");

const projAfter = await api(rohan.cookie, "GET", `/api/projects/${srgProjectId}`);
rec("D3 GET /api/projects/[id] after custom role (was 404)", "same as baseline — custom role should not widen scope",
  `${projAfter.status} (baseline: ${projBefore.status})`,
  projAfter.status === projBefore.status ? "PASS" : "FAIL",
  projBefore.status === 404 && projAfter.status === 200 ? "SCOPE ESCALATION: CUSTOM_* role defaults to COMPANY scope — baseRole's PROJECT scope lost" : "");

const finAfter = await api(rohan.cookie, "GET", "/api/expense-categories");
rec("D4 GET /api/expense-categories (finance.view override)", "200", `${finAfter.status}`, finAfter.status === 200 ? "PASS" : "FAIL");

const denied1 = await api(rohan.cookie, "PATCH", `/api/users/${hemaUserId}`, { name: "Pwned" });
rec("D5 rohan PATCH another user's profile (no users.manage)", "403", `${denied1.status} ${denied1.data?.error ?? "ok"}`, denied1.status === 403 ? "PASS" : "FAIL");

const denied2 = await api(rohan.cookie, "PATCH", `/api/employees/${vardaanEmpId}`, { designation: "Pwned" });
rec("D6 rohan PATCH owner's employee record (no hr.manage)", "403", `${denied2.status} ${denied2.data?.error ?? "ok"}`, denied2.status === 403 ? "PASS" : "FAIL");

const empRoster2 = await api(rohan.cookie, "GET", `/api/employees/${vardaanEmpId}`);
const leaked2 = sensitiveKeys.filter((k) => empRoster2.data && k in empRoster2.data);
rec("D7 roster view still redacted after custom role", "no sensitive keys", `leaked: [${leaked2.join(",") || "none"}]`, leaked2.length === 0 ? "PASS" : "FAIL");

const payrollDenied = await api(rohan.cookie, "GET", "/api/payroll");
rec("D8 GET /api/payroll (no payroll perms)", "403", `${payrollDenied.status} ${payrollDenied.data?.error ?? "ok"}`, payrollDenied.status === 403 ? "PASS" : payrollDenied.status === 404 ? "PASS" : "FAIL");

// ═══════════════ PHASE E — HEMA (HR_MANAGER, tier 3) escalation probes ═══
console.log("\n═══ E. HR_MANAGER vs tier-2 custom-role employee ═══");
// promote rohan to CUSTOM_DIRECTOR (tier 2) as owner first
const promote = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "CUSTOM_DIRECTOR" });
console.log(`  (setup) owner PATCH rohan → CUSTOM_DIRECTOR: ${promote.status}`);

const e1 = await api(hema.cookie, "PATCH", `/api/employees/${rohanEmpId}`, { designation: "HR-Hacked" });
const e1db = await prisma.employee.findUnique({ where: { id: rohanEmpId }, select: { designation: true } });
rec("E1 hr_manager PATCH employee whose user has TIER-2 custom role", "403 (tier 3 can't manage tier 2)",
  `${e1.status} ${e1.data?.error ?? "ok"} | DB designation=${e1db?.designation}`,
  e1.status === 403 ? "PASS" : "FAIL",
  e1.status === 200 ? "PRIVILEGE ESCALATION: canManageSpecificEmployee normalizes CUSTOM_*→SUPERVISOR so tier check passes" : "");
if (e1.status === 200) await prisma.employee.update({ where: { id: rohanEmpId }, data: { designation: "Site Engineer" } });

const e2 = await api(hema.cookie, "PATCH", `/api/employees/${vardaanEmpId}`, { designation: "x" });
rec("E2 control: hr_manager PATCH owner's employee (H1)", "403", `${e2.status} ${e2.data?.error ?? "ok"}`, e2.status === 403 ? "PASS" : "FAIL");

const e3 = await api(hema.cookie, "PATCH", `/api/users/${rohanUserId}`, { active: false });
const e3db = await prisma.user.findUnique({ where: { id: rohanUserId }, select: { active: true } });
rec("E3 hr_manager deactivate tier-2 custom-role user", "403",
  `${e3.status} ${e3.data?.error ?? "ok"} | DB active=${e3db?.active}`,
  e3.status === 403 ? "PASS" : "FAIL",
  e3.status === 200 ? "PRIVILEGE ESCALATION + deactivation side-effects ran (sessions revoked, tasks cancelled)" : "");
if (e3.status === 200 && e3db?.active === false) {
  await prisma.user.update({ where: { id: rohanUserId }, data: { active: true } });
  await prisma.employee.updateMany({ where: { userId: rohanUserId }, data: { active: true } });
  console.log("  (restored rohan active=true)");
}

const e4 = await api(hema.cookie, "PATCH", `/api/users/${anuragUserId}`, { active: false });
const e4db = await prisma.user.findUnique({ where: { id: anuragUserId }, select: { active: true } });
rec("E4 control: hr_manager deactivate BUILT-IN tier-2 (PROJECT_DIRECTOR)", "403",
  `${e4.status} ${e4.data?.error ?? "ok"} | DB active=${e4db?.active}`, e4.status === 403 && e4db?.active === true ? "PASS" : "FAIL");

const e5 = await api(hema.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "SITE_ENGINEER" });
rec("E5 hr_manager demote tier-2 custom-role user", "403 (custom tier checked on role change)",
  `${e5.status} ${e5.data?.error ?? "ok"}`, e5.status === 403 ? "PASS" : "WARN",
  e5.status === 200 ? "role-change path bypassed custom tier check" : e5.status === 403 ? "" : "");

const e6 = await api(hema.cookie, "PATCH", `/api/users/${rohanUserId}`, { name: "Pwned By HR" });
const e6db = await prisma.user.findUnique({ where: { id: rohanUserId }, select: { name: true } });
rec("E6 hr_manager edit tier-2 custom-role user's profile", "403",
  `${e6.status} ${e6.data?.error ?? "ok"} | DB name=${e6db?.name}`,
  e6.status === 403 ? "PASS" : "FAIL",
  e6.status === 200 ? "PRIVILEGE ESCALATION via profile-edit path" : "");
if (e6.status === 200) await prisma.user.update({ where: { id: rohanUserId }, data: { name: "Rohan Testemp" } });

const e7 = await api(hema.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "OWNER" });
rec("E7 hr_manager assign OWNER role", "403", `${e7.status} ${e7.data?.error ?? "ok"}`, e7.status === 403 ? "PASS" : "FAIL");

const e8 = await api(hema.cookie, "POST", "/api/custom-roles", { key: "HRBOSS", label: "HR Boss", baseRole: "PROJECT_DIRECTOR", permissions: [] });
rec("E8 hr_manager create custom role on tier-2 base", "403 (can't template above own tier)", `${e8.status} ${e8.data?.error ?? "ok"}`, e8.status === 403 ? "PASS" : "FAIL");

// ═══════════════ PHASE F — cross-tenant NCR + audit + cleanup ═══
console.log("\n═══ F. Cross-tenant write probe + audit trail ═══");
if (foreignProject) {
  const fncr = await api(owner.cookie, "POST", "/api/quality-control/ncr", { projectId: foreignProject.id, title: "ROLETEST cross-tenant", description: "probe" });
  const fncrRow = fncr.data?.id ? await prisma.nonConformanceReport.findUnique({ where: { id: fncr.data.id }, select: { companyId: true } }) : null;
  rec("F1 owner POST ncr on foreign project", "reject — project not in caller's company",
    `${fncr.status} ${fncr.data?.error ?? "ok"} | NCR companyId=${fncrRow?.companyId}`,
    fncr.status >= 400 ? "PASS" : "FAIL",
    fncr.status === 201 ? `BUG: NCR written into foreign tenant ${fncrRow?.companyId} via project.company.id` : "");
  if (fncr.data?.id) await prisma.nonConformanceReport.delete({ where: { id: fncr.data.id } });
}

// audit trail
const audits = await prisma.auditLog.findMany({
  where: { OR: [
    { entityType: "User", entityId: rohanUserId },
    { entityType: "Employee", entityId: rohanEmpId },
    { entityType: "CustomRole" },
  ] },
  orderBy: { timestamp: "desc" }, take: 15,
  select: { action: true, entityType: true, before: true, after: true, timestamp: true },
});
const auditKinds = [...new Set(audits.map((a) => a.action))];
rec("F2 audit trail", "USER_ROLE_CHANGE + CUSTOM_ROLE_CREATED + EMPLOYEE_UPDATE present",
  `actions: ${auditKinds.join(", ") || "none"}`,
  auditKinds.includes("USER_ROLE_CHANGE") && auditKinds.includes("CUSTOM_ROLE_CREATED") ? "PASS" : "WARN");

// ── cleanup: restore rohan to SITE_ENGINEER, drop overrides ──
console.log("\n=== cleanup ===");
await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}/permissions`, { permissions: [] });
const restore = await api(owner.cookie, "PATCH", `/api/users/${rohanUserId}`, { role: "SITE_ENGINEER" });
const finalRole = await prisma.user.findUnique({ where: { id: rohanUserId }, select: { role: true, active: true } });
const finalEmp = await prisma.employee.findUnique({ where: { id: rohanEmpId }, select: { departmentId: true, hierarchyLevel: true, reportsToEmployeeId: true, designation: true } });
console.log(`restore role PATCH: ${restore.status} | final User.role=${finalRole?.role} active=${finalRole?.active} | emp dept=${finalEmp?.departmentId} hier=${finalEmp?.hierarchyLevel}`);

// ── summary ──
const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const f of fails) console.log(`  ❌ ${f.name}: ${f.detail || f.actual}`);
for (const w of warns) console.log(`  ⚠️  ${w.name}: ${w.actual}`);
await prisma.$disconnect();

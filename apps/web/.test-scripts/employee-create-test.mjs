/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Employee create + delete flow test (as OWNER):
//   cross-tenant relation fields at creation, input validation,
//   delete + roster visibility.
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
  if (!session) return { cookie: null, status: res.status };
  return { cookie: session, status: res.status };
}

async function demoLogin(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

const qaDeptId = "cmu71ujzi0001vleqzir2p57o";
const foreignDept = await prisma.department.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } });
const foreignLoc = await prisma.stockLocation.findFirst({ where: { companyId: OTHER }, select: { id: true } });
const foreignCrew = await prisma.crew.findFirst({ where: { companyId: OTHER }, select: { id: true } });
const foreignProj = await prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } });
const ownLoc = await prisma.stockLocation.findFirst({ where: { companyId: SRG }, select: { id: true } });

console.log("=== signing in ===");
const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const hc = (await signIn("hema.testhr@nirman.internal", PW)).cookie;
console.log("owner:", !!oc, "| hema:", !!hc);
if (!oc || !hc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const post = (c, body) => api(c, "POST", "/api/employees", body);
const createdIds = [];

console.log("\n═══ A. Create — cross-tenant relation fields ═══");
{
  const foreignDept_ = await post(oc, { name: "X ForeignDept", departmentId: foreignDept.id });
  rec("A1 foreign company departmentId",
    "404 — not linked",
    `${foreignDept_.status} ${foreignDept_.data?.error ?? ""}`,
    foreignDept_.status === 404 ? "PASS" : "FAIL");
  if (foreignDept_.data?.id) createdIds.push(foreignDept_.data.id);

  const badDept = await post(oc, { name: "X BadDept", departmentId: "no-such-dept" });
  rec("A2 nonexistent departmentId",
    "404 — not a 500",
    `${badDept.status} ${badDept.data?.error ?? ""}`,
    badDept.status === 404 ? "PASS" : "FAIL");
  if (badDept.data?.id) createdIds.push(badDept.data.id);

  const foreignLoc_ = await post(oc, { name: "X ForeignLoc", reportingLocationId: foreignLoc.id });
  rec("A3 foreign company reportingLocationId",
    "404 — not linked",
    `${foreignLoc_.status} ${foreignLoc_.data?.error ?? ""}`,
    foreignLoc_.status === 404 ? "PASS" : "FAIL");
  if (foreignLoc_.data?.id) createdIds.push(foreignLoc_.data.id);

  const foreignCrew_ = await post(oc, { name: "X ForeignCrew", crewId: foreignCrew?.id ?? "fake-crew" });
  rec("A4 foreign company crewId",
    "404",
    `${foreignCrew_.status} ${foreignCrew_.data?.error ?? ""}`,
    foreignCrew_.status === 404 ? "PASS" : "FAIL");
  if (foreignCrew_.data?.id) createdIds.push(foreignCrew_.data.id);

  const foreignProj_ = await post(oc, { name: "X ForeignProj", activeProjectId: foreignProj.id });
  rec("A5 foreign company activeProjectId",
    "404",
    `${foreignProj_.status} ${foreignProj_.data?.error ?? ""}`,
    foreignProj_.status === 404 ? "PASS" : "FAIL");
  if (foreignProj_.data?.id) createdIds.push(foreignProj_.data.id);
}

console.log("\n═══ B. Create — input validation + happy path ═══");
{
  const noName = await post(oc, { trade: "Mason" });
  rec("B1 missing name", "400", `${noName.status} ${noName.data?.error ?? ""}`, noName.status === 400 ? "PASS" : "FAIL");

  const badEmail = await post(oc, { name: "X", email: "nope" });
  rec("B2 invalid email", "400", `${badEmail.status} ${badEmail.data?.error ?? ""}`, badEmail.status === 400 ? "PASS" : "FAIL");

  const badHier = await post(oc, { name: "X", hierarchyLevel: 99 });
  rec("B3 hierarchyLevel out of range (99)", "400", `${badHier.status} ${badHier.data?.error ?? ""}`, badHier.status === 400 ? "PASS" : "FAIL");

  const ok = await post(oc, { name: "E2E Temp Worker", trade: "Mason", departmentId: qaDeptId, reportingLocationId: ownLoc.id, dailyRate: 500 });
  const row = ok.data?.id ? await prisma.employee.findUnique({ where: { id: ok.data.id } }) : null;
  rec("B4 valid employee with own dept + location",
    "201 + dept + location linked",
    `${ok.status} dept=${row?.departmentId === qaDeptId} loc=${row?.reportingLocationId === ownLoc.id}`,
    ok.status === 200 || ok.status === 201 ? (row?.departmentId === qaDeptId && row?.reportingLocationId === ownLoc.id ? "PASS" : "FAIL") : "FAIL");
  if (row) createdIds.push(row.id);
}

console.log("\n═══ C. Delete + visibility ═══");
{
  const target = createdIds[createdIds.length - 1];
  const delActive = await api(oc, "DELETE", `/api/employees/${target}`);
  rec("C1 delete ACTIVE employee → guard refuses",
    "400 deactivate-first guard",
    `${delActive.status} ${delActive.data?.error ?? ""}`,
    delActive.status === 400 ? "PASS" : "FAIL");

  // Proper flow: mark inactive, then delete.
  const deact = await api(oc, "PATCH", `/api/employees/${target}`, { active: false });
  const del = await api(oc, "DELETE", `/api/employees/${target}`);
  const row = await prisma.employee.findUnique({ where: { id: target } });
  const rosterAfter = await api(oc, "GET", "/api/employees");
  const stillInRoster = JSON.stringify(rosterAfter.data).includes(target);
  rec("C2 deactivate → delete → gone from roster",
    "deact 200 + del 200 + deletedAt + hidden",
    `deact=${deact.status} del=${del.status} deletedAt=${!!row?.deletedAt} stillInRoster=${stillInRoster}`,
    deact.status === 200 && del.status === 200 && !!row?.deletedAt && !stillInRoster ? "PASS" : "FAIL");

  const delAgain = await api(oc, "DELETE", `/api/employees/${target}`);
  rec("C3 double delete → 404 not 500",
    "404",
    `${delAgain.status} ${delAgain.data?.error ?? ""}`,
    delAgain.status === 404 ? "PASS" : "FAIL");

  const delMissing = await api(oc, "DELETE", "/api/employees/no-such-employee");
  rec("C4 nonexistent employee delete",
    "404",
    `${delMissing.status} ${delMissing.data?.error ?? ""}`,
    delMissing.status === 404 ? "PASS" : "FAIL");

  const rohan = await prisma.employee.findFirst({ where: { companyId: SRG, userId: "cmu71ujzx0005vleq9qjtot5p" }, select: { id: true } });
  const hcDel = await api(hc, "DELETE", `/api/employees/${rohan.id}`);
  const rohanStill = await prisma.employee.findUnique({ where: { id: rohan.id }, select: { deletedAt: true } });
  rec("C5 HR delete on ACTIVE lower-tier employee → guard refuses",
    "400 deactivate-first guard",
    `${hcDel.status} deleted=${!!rohanStill?.deletedAt}`,
    hcDel.status === 400 && !rohanStill?.deletedAt ? "PASS" : "FAIL");
}

console.log("\n═══ cleanup ═══");
{
  for (const id of createdIds) {
    await prisma.employee.updateMany({ where: { id }, data: { deletedAt: new Date() } }).catch(() => {});
  }
  console.log(`marked ${createdIds.length} temp employees deleted`);
}

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}: ${r.actual}`);
await prisma.$disconnect();

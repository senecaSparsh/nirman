/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Material issue flow test (as OWNER + scoped engineer):
//   cross-tenant project/dept/requisition, over-issue, validation,
//   scope enforcement, happy path with stock decrement.
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
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.map((c) => c.split(";")[0]).filter((c) => c.includes("session")).join("; ");
  return { cookie: session || null };
}

async function demoLogin(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

// ── fixture ──
const stock = await prisma.stockLocationItem.findFirst({
  where: { qty: { gt: 100 }, location: { companyId: SRG, projectId: { not: null } } },
  include: { location: { select: { id: true, projectId: true } }, material: { select: { id: true, name: true } } },
});
const LOC = stock.location.id;
const MAT = stock.material.id;
const ONHAND = Number(stock.qty);
let curQty = ONHAND;
const ownProj = { id: stock.location.projectId };
const otherOwnProj = await prisma.project.findFirst({ where: { companyId: SRG, deletedAt: null, id: { not: ownProj.id } }, select: { id: true, name: true } });
const foreignProj = await prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } });
const foreignDept = await prisma.department.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } });
const ownDept = await prisma.department.findFirst({ where: { companyId: SRG, deletedAt: null }, select: { id: true } });
const foreignLoc = await prisma.stockLocation.findFirst({ where: { companyId: OTHER }, select: { id: true } });
// Requisitions for the mismatch probes — create if missing.
let otherProjReq = await prisma.materialRequisition.findFirst({ where: { projectId: otherOwnProj.id, status: "APPROVED" }, select: { id: true } });
if (!otherProjReq) {
  const u = await prisma.userCompany.findFirst({ where: { companyId: SRG, role: "OWNER" }, select: { userId: true } });
  const r = await prisma.materialRequisition.create({
    data: {
      reqNumber: `E2E-REQ-${Date.now()}`, projectId: otherOwnProj.id, requestedById: u.userId,
      status: "APPROVED", lines: { create: [{ materialId: MAT, qty: 5 }] },
    },
  });
  otherProjReq = r;
  console.log("(created temp requisition for mismatch probe)");
}
const foreignReq = await prisma.materialRequisition.findFirst({ where: { project: { companyId: OTHER }, status: "APPROVED" }, select: { id: true } });
let validReq = await prisma.materialRequisition.findFirst({ where: { projectId: ownProj.id, status: "APPROVED" }, select: { id: true } });
if (!validReq) {
  const u = await prisma.userCompany.findFirst({ where: { companyId: SRG, role: "OWNER" }, select: { userId: true } });
  validReq = await prisma.materialRequisition.create({
    data: { reqNumber: `E2E-REQ-OWN-${Date.now()}`, projectId: ownProj.id, requestedById: u.userId, status: "APPROVED", lines: { create: [{ materialId: MAT, qty: 5 }] } },
  });
}

const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const rc = (await signIn("rohan.testemp@nirman.internal", PW)).cookie;
console.log("owner:", !!oc, "| rohan:", !!rc, `| stock=${ONHAND}@${LOC} mat=${MAT}`);
if (!oc || !rc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const issue = (c, body) => api(c, "POST", "/api/issue-materials", body);
const line = (qty, mat = MAT) => [{ materialId: mat, qty }];

console.log("\n═══ A. Cross-tenant targets ═══");
{
  const issuesBefore = await prisma.materialIssue.count({ where: { project: { companyId: OTHER } } });
  const r = await issue(oc, { projectId: foreignProj.id, fromLocationId: LOC, lines: line(1) });
  const issuesAfter = await prisma.materialIssue.count({ where: { project: { companyId: OTHER } } });
  rec("A1 issue to FOREIGN company project",
    "reject — nothing written in their tenant",
    `${r.status} ${r.data?.error ?? ""} | their issues ${issuesBefore}→${issuesAfter}`,
    r.status >= 400 && issuesAfter === issuesBefore ? "PASS" : "FAIL");

  const deptIssuesBefore = await prisma.materialIssue.count({ where: { department: { companyId: OTHER } } });
  const r2 = await issue(oc, { departmentId: foreignDept.id, fromLocationId: LOC, lines: line(1) });
  const deptIssuesAfter = await prisma.materialIssue.count({ where: { department: { companyId: OTHER } } });
  rec("A2 issue to FOREIGN company department",
    "reject — nothing written in their tenant",
    `${r2.status} ${r2.data?.error ?? ""} | their issues ${deptIssuesBefore}→${deptIssuesAfter}`,
    r2.status >= 400 && deptIssuesAfter === deptIssuesBefore ? "PASS" : "FAIL");

  const r3 = await issue(oc, { projectId: ownProj.id, fromLocationId: foreignLoc.id, lines: line(1) });
  rec("A3 issue FROM foreign company location",
    "404 location not in company",
    `${r3.status} ${r3.data?.error ?? ""}`,
    r3.status === 404 ? "PASS" : "FAIL");

  const r4 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(1), requisitionId: foreignReq.id });
  rec("A4 foreign company's APPROVED requisition linked",
    "reject — req not this project's/company's",
    `${r4.status} ${r4.data?.error ?? ""}`,
    r4.status >= 400 ? "PASS" : "FAIL");

  const r5 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(1), requisitionId: otherProjReq.id });
  rec("A5 requisition of a DIFFERENT own project linked",
    "reject — req is for another project",
    `${r5.status} ${r5.data?.error ?? ""}`,
    r5.status >= 400 ? "PASS" : "FAIL");

  const r6 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(1), requisitionId: validReq.id });
  if (r6.status === 201) curQty -= 1;
  rec("A6 VALID same-project requisition → linked",
    "201 + requisitionId stored on the issue",
    `${r6.status} | linked=${(await prisma.materialIssue.findFirst({ where: { requisitionId: validReq.id }, select: { id: true } })) ? "yes" : "no"}`,
    r6.status === 201 ? "PASS" : "FAIL");
}

console.log("\n═══ B. Quantity + validation ═══");
{
  const r = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(ONHAND + 100) });
  const stockAfter = await prisma.stockLocationItem.findFirst({ where: { locationId: LOC, materialId: MAT }, select: { qty: true } });
  rec("B1 issue more than available",
    `reject — stock stays ${curQty}`,
    `${r.status} ${r.data?.error ?? ""} | qty=${stockAfter?.qty}`,
    r.status >= 400 && Number(stockAfter?.qty) === curQty ? "PASS" : "FAIL");

  const r2 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: [{ materialId: MAT, qty: ONHAND - 100 }, { materialId: MAT, qty: 200 }] });
  const stockAfter2 = await prisma.stockLocationItem.findFirst({ where: { locationId: LOC, materialId: MAT }, select: { qty: true } });
  rec("B2 duplicate lines summing over stock",
    `reject — stock stays ${curQty}`,
    `${r2.status} | qty=${stockAfter2?.qty}`,
    r2.status >= 400 && Number(stockAfter2?.qty) === curQty ? "PASS" : "FAIL");

  const r3 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(0) });
  rec("B3 qty=0", "400", `${r3.status} ${r3.data?.error ?? ""}`, r3.status === 400 ? "PASS" : "FAIL");

  const r4 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(-5) });
  rec("B4 negative qty", "400", `${r4.status} ${r4.data?.error ?? ""}`, r4.status === 400 ? "PASS" : "FAIL");

  const r5 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(1, "no-such-material") });
  rec("B5 nonexistent material", "4xx", `${r5.status} ${r5.data?.error ?? ""}`, r5.status >= 400 && r5.status < 500 ? "PASS" : "FAIL");

  const r6 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: [] });
  rec("B6 empty lines", "400", `${r6.status} ${r6.data?.error ?? ""}`, r6.status === 400 ? "PASS" : "FAIL");

  const r7 = await issue(oc, { fromLocationId: LOC, lines: line(1) });
  rec("B7 no target (neither projectId nor departmentId)", "400", `${r7.status} ${r7.data?.error ?? ""}`, r7.status === 400 ? "PASS" : "FAIL");
}

console.log("\n═══ C. Scope + happy path ═══");
{
  const r = await issue(rc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(1) });
  const stockAfter = await prisma.stockLocationItem.findFirst({ where: { locationId: LOC, materialId: MAT }, select: { qty: true } });
  rec("C1 rohan (0 assigned projects) issues to this project",
    "403 scope-blocked, stock untouched",
    `${r.status} | qty=${stockAfter?.qty}`,
    r.status === 403 && Number(stockAfter?.qty) === curQty ? "PASS" : "FAIL");

  const r2 = await issue(oc, { projectId: ownProj.id, fromLocationId: LOC, lines: line(50), receiverName: "E2E Receiver" });
  const stockAfter2 = await prisma.stockLocationItem.findFirst({ where: { locationId: LOC, materialId: MAT }, select: { qty: true } });
  if (r2.status === 201) curQty -= 50;
  rec("C2 owner issues 50 → stock drops 50",
    `201 + qty=${curQty}`,
    `${r2.status} issue#=${r2.data?.issueNumber} | qty=${stockAfter2?.qty}`,
    r2.status === 201 && Number(stockAfter2?.qty) === curQty ? "PASS" : "FAIL");

  const r3 = await issue(oc, { departmentId: ownDept.id, fromLocationId: LOC, lines: line(10) });
  const stockAfter3 = await prisma.stockLocationItem.findFirst({ where: { locationId: LOC, materialId: MAT }, select: { qty: true } });
  if (r3.status === 201) curQty -= 10;
  rec("C3 issue to own department",
    `201 + qty=${curQty}`,
    `${r3.status} | qty=${stockAfter3?.qty}`,
    r3.status === 201 && Number(stockAfter3?.qty) === curQty ? "PASS" : "FAIL");
}

const fails = results.filter((r) => r.verdict === "FAIL");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL ════════════════`);
for (const r of fails) console.log(`  ❌ ${r.name}`);
await prisma.$disconnect();

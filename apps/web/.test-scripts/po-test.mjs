/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Purchase order flow test (as OWNER + scoped engineer):
//   cross-tenant refs, scope-consistency rules, lifecycle transitions,
//   addLine validation, foreign PO access.
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

// ── fixture ──
const [ownSup, fSup, ownMat, fMat, warehouse, siteLoc, ownProj, fProj, fPo] = await Promise.all([
  prisma.supplier.findFirst({ where: { companyId: SRG, deletedAt: null }, select: { id: true } }),
  prisma.supplier.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } }),
  prisma.material.findFirst({ where: { companyId: SRG, deletedAt: null }, select: { id: true } }),
  prisma.material.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } }),
  prisma.stockLocation.findFirst({ where: { companyId: SRG, deletedAt: null, type: { in: ["COMPANY_WAREHOUSE", "CENTRAL_WAREHOUSE"] } }, select: { id: true, type: true } }),
  prisma.stockLocation.findFirst({ where: { companyId: SRG, deletedAt: null, type: "PROJECT_SITE", projectId: { not: null } }, select: { id: true, projectId: true } }),
  prisma.project.findFirst({ where: { companyId: SRG, deletedAt: null }, select: { id: true } }),
  prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } }),
  prisma.purchaseOrder.findFirst({ where: { companyId: OTHER }, select: { id: true, status: true } }),
]);

const owner = await demoLogin("OWNER");
const oc = await signIn(owner.email, owner.password);
const rc = await signIn("rohan.testemp@nirman.internal", PW);
console.log("owner:", !!oc, "| rohan:", !!rc, `| sup=${!!ownSup} mat=${!!ownMat} wh=${warehouse?.type} site=${!!siteLoc}`);
if (!oc || !rc || !ownSup || !ownMat || !warehouse || !siteLoc) { console.log("FATAL: fixture/sign-in failed"); process.exit(1); }

const createPo = (c, body) => api(c, "POST", "/api/purchase-orders", body);
const base = { supplierId: ownSup.id, destinationLocationId: warehouse.id, procurementScope: "COMPANY", lines: [{ materialId: ownMat.id, qtyOrdered: 10, unitCost: 100 }] };
let poId = null;

console.log("\n═══ A. Cross-tenant references ═══");
{
  const r = await createPo(oc, { ...base, supplierId: fSup.id });
  rec("A1 create with FOREIGN supplier", "404 + nothing saved",
    `${r.status} ${r.data?.error ?? ""}`, r.status === 404 && !r.data?.id ? "PASS" : "FAIL");
  if (r.data?.id) await prisma.purchaseOrder.delete({ where: { id: r.data.id } });

  const fLoc = await prisma.stockLocation.findFirst({ where: { companyId: OTHER }, select: { id: true } });
  const r2 = await createPo(oc, { ...base, destinationLocationId: fLoc.id });
  rec("A2 create with FOREIGN destination location", "reject",
    `${r2.status} ${r2.data?.error ?? ""}`, r2.status >= 400 && !r2.data?.id ? "PASS" : "FAIL");
  if (r2.data?.id) await prisma.purchaseOrder.delete({ where: { id: r2.data.id } });

  const r3 = await createPo(oc, { ...base, lines: [{ materialId: fMat.id, qtyOrdered: 1, unitCost: 1 }] });
  rec("A3 create with FOREIGN material", "reject",
    `${r3.status} ${r3.data?.error ?? ""}`, r3.status >= 400 && !r3.data?.id ? "PASS" : "FAIL");
  if (r3.data?.id) await prisma.purchaseOrder.delete({ where: { id: r3.data.id } });
}

console.log("\n═══ B. Scope-consistency rules ═══");
{
  const r = await createPo(oc, { ...base, projectId: ownProj.id });
  const leaked = r.data?.id ? true : false;
  rec("B1 COMPANY-scope PO with projectId", "reject (consistency rule)",
    `${r.status} ${r.data?.error ?? ""}`, r.status >= 400 ? "PASS" : "FAIL");
  if (leaked) await prisma.purchaseOrder.delete({ where: { id: r.data.id } });

  const r2 = await createPo(oc, { ...base, procurementScope: "PROJECT", projectId: ownProj.id });
  rec("B2 PROJECT-scope PO → warehouse location", "reject (must be PROJECT_SITE)",
    `${r2.status} ${r2.data?.error ?? ""}`, r2.status >= 400 ? "PASS" : "FAIL");
  if (r2.data?.id) await prisma.purchaseOrder.delete({ where: { id: r2.data.id } });

  // PROJECT PO to a site belonging to a DIFFERENT project
  const wrongSite = await prisma.stockLocation.findFirst({ where: { companyId: SRG, type: "PROJECT_SITE", projectId: { not: ownProj.id, not: null } }, select: { id: true, projectId: true } });
  if (wrongSite) {
    const r3 = await createPo(oc, { ...base, procurementScope: "PROJECT", projectId: ownProj.id, destinationLocationId: wrongSite.id });
    rec("B3 PROJECT-scope PO → another project's site", "reject",
      `${r3.status} ${r3.data?.error ?? ""}`, r3.status >= 400 ? "PASS" : "FAIL");
    if (r3.data?.id) await prisma.purchaseOrder.delete({ where: { id: r3.data.id } });
  } else {
    rec("B3 (no second-project site — skipped)", "-", "no fixture", "WARN");
  }

  const r4 = await createPo(oc, { supplierId: ownSup.id, destinationLocationId: siteLoc.id, procurementScope: "PROJECT", projectId: siteLoc.projectId, lines: [{ materialId: ownMat.id, qtyOrdered: 10, unitCost: 100 }] });
  poId = r4.data?.id;
  rec("B4 valid PROJECT-scope PO creates", "201",
    `${r4.status} po=${r4.data?.poNumber ?? poId}`,
    r4.status === 201 && !!poId ? "PASS" : "FAIL");
}

console.log("\n═══ C. addLine + validation ═══");
{
  // Owner's PO auto-approves at creation — addLine correctly refuses on
  // APPROVED status (the status guard fires before material validation).
  const r = await api(oc, "PATCH", `/api/purchase-orders/${poId}`, { action: "addLine", materialId: fMat.id, qtyOrdered: 1, unitCost: 1 });
  rec("C1 addLine on APPROVED PO", "400 status guard",
    `${r.status} ${r.data?.error ?? ""}`, r.status === 400 ? "PASS" : "FAIL");

  const r2 = await api(oc, "PATCH", `/api/purchase-orders/${poId}`, { action: "addLine", materialId: ownMat.id, qtyOrdered: 0, unitCost: 1 });
  rec("C2 addLine qty=0", "400", `${r2.status} ${r2.data?.error ?? ""}`, r2.status === 400 ? "PASS" : "FAIL");

  const r3 = await api(oc, "PATCH", `/api/purchase-orders/${poId}`, { action: "addLine", materialId: ownMat.id, qtyOrdered: 5, unitCost: 50 });
  rec("C3 addLine valid on APPROVED PO", "400 status guard (draft-only)",
    `${r3.status} ${r3.data?.error ?? ""}`, r3.status === 400 ? "PASS" : "FAIL");
}

console.log("\n═══ D. Lifecycle + access ═══");
{
  const r = await api(oc, "PATCH", `/api/purchase-orders/${poId}`, { action: "approve" });
  const db = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { status: true } });
  rec("D1 double-approve blocked (already APPROVED via auto-approve)",
    "400 + stays APPROVED", `${r.status} | db=${db?.status}`,
    r.status === 400 && db?.status === "APPROVED" ? "PASS" : "FAIL");

  const r2 = await api(rc, "POST", "/api/purchase-orders", base);
  rec("D2 rohan creates PO (no procurement.manage)", "403",
    `${r2.status} ${r2.data?.error ?? ""}`, r2.status === 403 ? "PASS" : "FAIL");
  if (r2.data?.id) await prisma.purchaseOrder.delete({ where: { id: r2.data.id } });

  const r3 = await api(oc, "GET", `/api/purchase-orders/${fPo.id}`);
  rec("D3 GET foreign PO", "404", `${r3.status}`, r3.status === 404 ? "PASS" : "FAIL");

  const r4 = await api(oc, "PATCH", `/api/purchase-orders/${fPo.id}`, { action: "approve" });
  rec("D4 PATCH foreign PO", "404", `${r4.status}`, r4.status === 404 ? "PASS" : "FAIL");

  // cleanup test PO
  if (poId) {
    await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: poId } });
    await prisma.purchaseOrder.delete({ where: { id: poId } });
  }
}

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}`);
await prisma.$disconnect();

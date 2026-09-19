/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Expense flow test (as OWNER + scoped engineer):
//   cross-tenant FK refs (project/category/supplier), field update
//   validation, scope on create + read, submit→approve lifecycle.
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
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": BASE },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(Number(res.headers.get("retry-after") ?? 15) * 1000);
      continue;
    }
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

const [ownProj, fProj, ownCat, fCat, ownSup, fSup] = await Promise.all([
  prisma.project.findFirst({ where: { companyId: SRG, deletedAt: null }, select: { id: true } }),
  prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } }),
  prisma.expenseCategory.findFirst({ where: { companyId: SRG }, select: { id: true, name: true } }),
  prisma.expenseCategory.findFirst({ where: { companyId: OTHER }, select: { id: true } }),
  prisma.supplier.findFirst({ where: { companyId: SRG, deletedAt: null }, select: { id: true } }),
  prisma.supplier.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true } }),
]);

const owner = await demoLogin("OWNER");
const oc = await signIn(owner.email, owner.password);
const rc = await signIn("rohan.testemp@nirman.internal", PW);
console.log("owner:", !!oc, "| rohan:", !!rc, `| ownProj=${ownProj.id} cat=${ownCat?.name}`);
if (!oc || !rc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const mkBody = (over = {}) => ({ category: ownCat.name, amount: 500, ...over });
let expId = null;

console.log("\n═══ A. Cross-tenant references on create ═══");
{
  const r = await api(oc, "POST", "/api/expenses", mkBody({ projectId: fProj.id, categoryId: ownCat.id }));
  rec("A1 create with FOREIGN project",
    "reject — nothing saved",
    `${r.status} ${r.data?.error ?? ""}`,
    r.status >= 400 && !r.data?.id ? "PASS" : "FAIL");
  if (r.data?.id) await prisma.expense.delete({ where: { id: r.data.id } });

  const r2 = await api(oc, "POST", "/api/expenses", mkBody({ categoryId: fCat.id }));
  rec("A2 create with FOREIGN category",
    "reject — nothing saved",
    `${r2.status} ${r2.data?.error ?? ""}`,
    r2.status >= 400 && !r2.data?.id ? "PASS" : "FAIL");
  if (r2.data?.id) await prisma.expense.delete({ where: { id: r2.data.id } });

  const r3 = await api(oc, "POST", "/api/expenses", mkBody({ supplierId: fSup.id }));
  rec("A3 create with FOREIGN supplier",
    "reject — nothing saved",
    `${r3.status} ${r3.data?.error ?? ""}`,
    r3.status >= 400 && !r3.data?.id ? "PASS" : "FAIL");
  if (r3.data?.id) await prisma.expense.delete({ where: { id: r3.data.id } });

  const r4 = await api(oc, "POST", "/api/expenses", mkBody({ projectId: ownProj.id, categoryId: ownCat.id, supplierId: ownSup.id }));
  expId = r4.data?.id;
  rec("A4 valid create → DRAFT expense",
    "201 + id",
    `${r4.status} id=${expId} status=${r4.data?.status}`,
    r4.status === 201 && !!expId ? "PASS" : "FAIL");
}

console.log("\n═══ B. Cross-tenant refs on update ═══");
{
  const r = await api(oc, "PATCH", `/api/expenses/${expId}`, { projectId: fProj.id });
  const db = await prisma.expense.findUnique({ where: { id: expId }, select: { projectId: true } });
  rec("B1 PATCH foreign project",
    "reject + unchanged",
    `${r.status} ${r.data?.error ?? ""} | db=${db?.projectId}`,
    r.status >= 400 && db?.projectId === ownProj.id ? "PASS" : "FAIL");

  const r2 = await api(oc, "PATCH", `/api/expenses/${expId}`, { supplierId: fSup.id });
  const db2 = await prisma.expense.findUnique({ where: { id: expId }, select: { supplierId: true } });
  rec("B2 PATCH foreign supplier",
    "reject + unchanged",
    `${r2.status} | db=${db2?.supplierId}`,
    r2.status >= 400 && db2?.supplierId === ownSup.id ? "PASS" : "FAIL");

  const r3 = await api(oc, "PATCH", `/api/expenses/${expId}`, { amount: 750, notes: "E2E updated" });
  const db3 = await prisma.expense.findUnique({ where: { id: expId }, select: { amount: true, notes: true } });
  rec("B3 PATCH valid fields",
    "200 + persisted",
    `${r3.status} | amount=${db3?.amount} notes=${db3?.notes}`,
    r3.status === 200 && Number(db3?.amount) === 750 ? "PASS" : "FAIL");

  const r4 = await api(oc, "PATCH", `/api/expenses/${expId}`, { projectId: "nonexistent-id" });
  rec("B4 PATCH nonexistent project",
    "404 clean",
    `${r4.status} ${r4.data?.error ?? ""}`,
    r4.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ C. Scoped user probes ═══");
{
  const r = await api(rc, "POST", "/api/expenses", mkBody({ projectId: ownProj.id }));
  const leaked = r.data?.id ? await prisma.expense.findUnique({ where: { id: r.data.id } }) : null;
  rec("C1 rohan (0 assigned projects) creates expense on a project",
    "403 — scope-blocked, nothing saved",
    `${r.status} | saved=${!!leaked}`,
    r.status === 403 && !leaked ? "PASS" : "FAIL");
  if (leaked) await prisma.expense.delete({ where: { id: leaked.id } });

  const list = await api(rc, "GET", "/api/expenses");
  rec("C2 rohan's expense list",
    "403 (no finance.view) or 200-scoped",
    `${list.status} rows=${Array.isArray(list.data) ? list.data.length : "?"}`,
    list.status === 403 || (list.status === 200 && Array.isArray(list.data) && list.data.length === 0) ? "PASS" : "FAIL");

  const r3 = await api(rc, "GET", `/api/expenses/${expId}`);
  rec("C3 rohan GETs the expense",
    "403 (no finance.view) or 404 scope",
    `${r3.status}`,
    r3.status === 403 || r3.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ D. Submit → approve lifecycle ═══");
{
  const r = await api(oc, "PATCH", `/api/expenses/${expId}`, { action: "submit" });
  const db = await prisma.expense.findUnique({ where: { id: expId }, select: { status: true } });
  rec("D1 submit draft (owner auto-approves)",
    "200 + status PENDING or APPROVED",
    `${r.status} ${JSON.stringify(r.data)} | db=${db?.status}`,
    r.status === 200 && (db?.status === "PENDING" || db?.status === "APPROVED") ? "PASS" : "FAIL");

  const r2 = await api(oc, "PATCH", `/api/expenses/${expId}`, { amount: 999 });
  rec("D2 edit approved/submitted expense",
    "rejected — only drafts editable",
    `${r2.status} ${r2.data?.error ?? ""}`,
    r2.status >= 400 ? "PASS" : "FAIL");

  const r3 = await api(oc, "DELETE", `/api/expenses/${expId}`);
  const db3 = await prisma.expense.findUnique({ where: { id: expId }, select: { id: true } });
  rec("D3 delete (finance.manage)",
    "200 + gone",
    `${r3.status} | exists=${!!db3}`,
    (r3.status === 200 && !db3) || r3.status === 404 ? "PASS" : "WARN");
  if (db3) await prisma.expense.delete({ where: { id: expId } }).catch(() => {});
}

// Cleanup any leftover test expense
if (expId) await prisma.expense.deleteMany({ where: { id: expId } }).catch(() => {});

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}`);
await prisma.$disconnect();

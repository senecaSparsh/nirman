/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Stock transfer flow test (as OWNER + scoped engineer):
//   group bounds, scope enforcement on source location, validation,
//   DRAFT → dispatch lifecycle with stock movement.
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

// ── fixture: stocked location + a second own location ──
const stock = await prisma.stockLocationItem.findFirst({
  where: { qty: { gt: 50 }, location: { companyId: SRG } },
  include: { location: { select: { id: true, projectId: true, name: true } }, material: { select: { id: true } } },
});
const SRC = stock.location.id;
const MAT = stock.material.id;
let curQty = Number(stock.qty);
const dst = await prisma.stockLocation.findFirst({
  where: { companyId: SRG, deletedAt: null, id: { not: SRC }, projectId: stock.location.projectId },
  select: { id: true, name: true },
}) ?? await prisma.stockLocation.findFirst({ where: { companyId: SRG, deletedAt: null, id: { not: SRC } }, select: { id: true, name: true } });
const foreignLoc = await prisma.stockLocation.findFirst({ where: { companyId: OTHER }, select: { id: true } });
const DST = dst.id;

const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const rc = (await signIn("rohan.testemp@nirman.internal", PW)).cookie;
console.log("owner:", !!oc, "| rohan:", !!rc, `| src=${stock.location.name} qty=${curQty} dst=${dst.name}`);
if (!oc || !rc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const transfer = (c, body) => api(c, "POST", "/api/transfers", body);
const act = (c, id, action) => api(c, "PATCH", `/api/transfers/${id}`, { action });
const line = (qty) => [{ materialId: MAT, qty }];

console.log("\n═══ A. Tenant + group bounds ═══");
{
  const r = await transfer(oc, { fromLocationId: foreignLoc.id, toLocationId: DST, lines: line(1) });
  rec("A1 transfer FROM a non-group company location",
    "404 not in group",
    `${r.status} ${r.data?.error ?? ""}`,
    r.status === 404 ? "PASS" : "FAIL");

  const r2 = await transfer(oc, { fromLocationId: SRC, toLocationId: foreignLoc.id, lines: line(1) });
  rec("A2 transfer TO a non-group company location",
    "404 not in group",
    `${r2.status} ${r2.data?.error ?? ""}`,
    r2.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ B. Scope enforcement ═══");
{
  const r = await transfer(rc, { fromLocationId: SRC, toLocationId: DST, lines: line(1) });
  const draft = r.data?.id ? await prisma.stockTransfer.findUnique({ where: { id: r.data.id } }) : null;
  rec("B1 rohan (0 assigned projects) transfers from a location",
    "403 — source not in his scope, nothing drafted",
    `${r.status} ${r.data?.error ?? ""} | drafted=${!!draft}`,
    r.status === 403 && !draft ? "PASS" : "FAIL");
  if (draft) await prisma.stockTransfer.delete({ where: { id: draft.id } });
}

console.log("\n═══ C. Validation ═══");
{
  const r = await transfer(oc, { fromLocationId: SRC, toLocationId: SRC, lines: line(1) });
  rec("C1 same source and destination",
    "reject",
    `${r.status} ${r.data?.error ?? ""}`,
    r.status >= 400 ? "PASS" : "FAIL");

  const r2 = await transfer(oc, { fromLocationId: SRC, toLocationId: DST, lines: [] });
  rec("C2 empty lines",
    "400",
    `${r2.status} ${r2.data?.error ?? ""}`,
    r2.status === 400 ? "PASS" : "FAIL");

  const r3 = await transfer(oc, { fromLocationId: SRC, toLocationId: DST, lines: line(0) });
  rec("C3 qty=0",
    "400",
    `${r3.status} ${r3.data?.error ?? ""}`,
    r3.status === 400 ? "PASS" : "FAIL");

  const r4 = await transfer(oc, { fromLocationId: SRC, toLocationId: DST, lines: line(-3) });
  rec("C4 negative qty",
    "400",
    `${r4.status} ${r4.data?.error ?? ""}`,
    r4.status === 400 ? "PASS" : "FAIL");

  const r5 = await transfer(oc, { fromLocationId: SRC, toLocationId: DST, lines: [{ materialId: "no-such-mat", qty: 1 }] });
  rec("C5 nonexistent material",
    "404",
    `${r5.status} ${r5.data?.error ?? ""}`,
    r5.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ D. Happy path: DRAFT → dispatch ═══");
{
  const create = await transfer(oc, { fromLocationId: SRC, toLocationId: DST, lines: line(20), notes: "E2E transfer" });
  const tid = create.data?.id;
  const gatePass = tid ? await prisma.gatePass.findFirst({ where: { refType: "StockTransfer", refId: tid }, select: { status: true } }) : null;
  const srcNow = await prisma.stockLocationItem.findFirst({ where: { locationId: SRC, materialId: MAT }, select: { qty: true } });
  rec("D1 create transfer → DRAFT + pending gate pass, stock unchanged",
    `201 + DRAFT + gatepass + qty=${curQty}`,
    `${create.status} status=${create.data?.status} gp=${gatePass?.status ?? "none"} qty=${srcNow?.qty}`,
    create.status === 201 && create.data?.status === "DRAFT" && !!gatePass && Number(srcNow?.qty) === curQty ? "PASS" : "FAIL");

  // Dispatch without approving the gate pass first — should be blocked.
  const disp = await act(oc, tid, "dispatch");
  rec("D2 dispatch before gate-pass approval",
    "rejected — gate pass must be approved first",
    `${disp.status} ${disp.data?.error ?? ""}`,
    disp.status >= 400 ? "PASS" : "WARN");

  // Approve the gate pass, then dispatch.
  if (gatePass) {
    const gp = await prisma.gatePass.findFirst({ where: { refType: "StockTransfer", refId: tid } });
    if (gp) await prisma.gatePass.update({ where: { id: gp.id }, data: { status: "APPROVED" } });
  }
  const disp2 = await act(oc, tid, "dispatch");
  const srcAfter = await prisma.stockLocationItem.findFirst({ where: { locationId: SRC, materialId: MAT }, select: { qty: true } });
  rec("D3 dispatch after approval → stock leaves source",
    `200 + source ${curQty}→${curQty - 20}`,
    `${disp2.status} | srcQty=${srcAfter?.qty}`,
    disp2.status === 200 && Number(srcAfter?.qty) === curQty - 20 ? "PASS" : "FAIL");
  if (disp2.status === 200) curQty -= 20;

  // Complete the receipt at destination.
  const comp = await act(oc, tid, "complete");
  const dstAfter = await prisma.stockLocationItem.findFirst({ where: { locationId: DST, materialId: MAT }, select: { qty: true } });
  rec("D4 complete → stock arrives at destination",
    "200 + dst qty +20",
    `${comp.status} | dstQty=${dstAfter?.qty}`,
    comp.status === 200 && Number(dstAfter?.qty) >= 20 ? "PASS" : "FAIL");
}

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}`);
await prisma.$disconnect();

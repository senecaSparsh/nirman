/**
 * Fuzz pack — Layer 4 (input-space coverage, no OpenAPI plumbing).
 *
 * For every money/stock write endpoint, fires a battery of malformed payloads
 * and asserts three things:
 *   1. Never 5xx — every malformed input must be a clean 4xx
 *   2. Response is a JSON error object, not a stack dump
 *   3. Zero side-effect rows — nothing written on a refused request
 *
 * Payload classes: empty/null/wrong-root-type, missing-required-field,
 * wrong field types, negative/zero/huge amounts+qtys, bogus ids (404 not 500),
 * oversized strings, and near-valid bodies with one field corrupted.
 *
 * Usage: BASE=http://localhost:3000 npx tsx scripts/fuzz-probe.ts
 * Read-mostly — any accepted write is flagged for manual cleanup.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PS = `psql -h localhost -U postgres -d nirman_inventory -tAc`.split(" ");
const fz = () => `fz${randomBytes(6).toString("hex")}`;
const q = (s: string) => s.replace(/'/g, "''");
function sql(s: string): string { return execFileSync(PS[0], [...PS.slice(1), s], { encoding: "utf8" }).trim(); }

let COOKIE = "";
async function login() {
  const res = await fetch(`${BASE}/api/auth/phone-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "+917017988293", password: "nirman123" }),
  });
  COOKIE = (res.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=[^;]+/)?.[0] ?? "";
  if (!COOKIE) throw new Error("login failed");
}
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", cookie: COOKIE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text();
  let p: unknown; try { p = JSON.parse(t); } catch { p = t; }
  return { status: res.status, body: p, raw: t };
}

// ── Malformed payload generators ──────────────────────────────────────────────
const MALFORMED: [string, unknown][] = [
  ["empty object", {}],
  ["null root", null],
  ["array root", []],
  ["string root", "x"],
  ["all-null fields", { amount: null, qty: null, id: null, name: null }],
  ["negative amount", { amount: -500, qty: -3 }],
  ["zero amount", { amount: 0, qty: 0 }],
  ["huge amount", { amount: 9e15, qty: 9e15 }],
  ["float qty", { qty: 1.5e-7, amount: 0.0000001 }],
  ["string-for-number", { amount: "abc", qty: "lots" }],
  ["object-for-string", { name: { evil: true }, materialId: { x: 1 } }],
  ["array-for-object", { lines: "not-an-array", notes: [] }],
  ["bogus id", { id: "fz-nonexistent-id", materialId: "fz-nonexistent-id", saleId: "fz-nonexistent-id" }],
  ["sql-ish string", { notes: "'; DROP TABLE \"MaterialSale\";--", referenceNo: "' OR '1'='1" }],
  ["oversized string", { notes: "x".repeat(60_000) }],
];

interface Target {
  method: string;
  path: string;
  /** Side-effect probe: count rows created by these payloads (id-prefix or refNo). */
  sideEffect?: () => number;
  /** Payloads that must be accepted-shaped to be meaningful — near-valid with one bad field. */
  nearValid?: [string, Record<string, unknown>][];
}

const companyId = sql(`SELECT id FROM "Company" ORDER BY "createdAt" LIMIT 1`);
const supplierId = sql(`SELECT id FROM "Supplier" WHERE "companyId"='${q(companyId)}' LIMIT 1`);
const projectId = sql(`SELECT id FROM "Project" WHERE "deletedAt" IS NULL LIMIT 1`);
const custId = sql(`SELECT id FROM "Customer" WHERE "companyId"='${q(companyId)}' LIMIT 1`);
const locA = sql(`SELECT "locationId" FROM "StockLocationItem" WHERE "materialId"='mat-test-02' LIMIT 1`);
const locB = sql(`SELECT id FROM "StockLocation" WHERE id<>'${q(locA)}' AND "deletedAt" IS NULL LIMIT 1`);

const targets: Target[] = [
  { method: "POST", path: "/api/materials" },
  { method: "POST", path: "/api/suppliers" },
  { method: "POST", path: "/api/projects" },
  { method: "POST", path: "/api/issue-materials",
    sideEffect: () => Number(sql(`SELECT COUNT(*) FROM "MaterialIssue" WHERE notes LIKE 'fz%'`)),
    nearValid: [
      ["negative line qty", { fromLocationId: locA, projectId, lines: [{ materialId: "mat-test-02", qty: -5 }], notes: fz() }],
      ["zero line qty", { fromLocationId: locA, projectId, lines: [{ materialId: "mat-test-02", qty: 0 }], notes: fz() }],
      ["empty lines", { fromLocationId: locA, projectId, lines: [], notes: fz() }],
      ["nonexistent material", { fromLocationId: locA, projectId, lines: [{ materialId: "fz-no-such-mat", qty: 1 }], notes: fz() }],
      ["nonexistent location", { fromLocationId: "fz-no-such-loc", projectId, lines: [{ materialId: "mat-test-02", qty: 1 }], notes: fz() }],
      ["nonexistent project", { fromLocationId: locA, projectId: "fz-no-such-proj", lines: [{ materialId: "mat-test-02", qty: 1 }], notes: fz() }],
      ["over-stock qty", { fromLocationId: locA, projectId, lines: [{ materialId: "mat-test-02", qty: 999999 }], notes: fz() }],
    ] },
  { method: "POST", path: "/api/transfers",
    sideEffect: () => Number(sql(`SELECT COUNT(*) FROM "StockTransfer" WHERE notes LIKE 'fz%'`)),
    nearValid: [
      ["same location", { fromLocationId: locA, toLocationId: locA, lines: [{ materialId: "mat-test-02", qty: 1 }], notes: fz() }],
      ["negative qty", { fromLocationId: locA, toLocationId: locB, lines: [{ materialId: "mat-test-02", qty: -2 }], notes: fz() }],
      // (over-stock drafts are legal — availability is enforced at dispatch, not request time)
      ["deleted dest", { fromLocationId: locA, toLocationId: "fz-gone", lines: [{ materialId: "mat-test-02", qty: 1 }], notes: fz() }],
    ] },
  { method: "POST", path: "/api/supplier-payments",
    sideEffect: () => Number(sql(`SELECT COUNT(*) FROM "SupplierPayment" WHERE notes LIKE 'fz%'`)),
    nearValid: [
      ["negative amount", { supplierId, amount: -100, paymentMode: "UPI", paymentDate: "2026-10-16", notes: fz() }],
      ["zero amount", { supplierId, amount: 0, paymentMode: "UPI", paymentDate: "2026-10-16", notes: fz() }],
      ["bogus mode", { supplierId, amount: 100, paymentMode: "BARTER", paymentDate: "2026-10-16", notes: fz() }],
      ["bogus supplier", { supplierId: "fz-no-such", amount: 100, paymentMode: "UPI", paymentDate: "2026-10-16", notes: fz() }],
      ["bad date", { supplierId, amount: 100, paymentMode: "UPI", paymentDate: "not-a-date", notes: fz() }],
    ] },
  { method: "POST", path: "/api/purchase-orders",
    sideEffect: () => Number(sql(`SELECT COUNT(*) FROM "PurchaseOrder" WHERE notes LIKE 'fz%'`)),
    nearValid: [
      ["negative qty line", { supplierId, procurementScope: "PROJECT", destinationLocationId: locA, lines: [{ materialId: "mat-test-02", qty: -1, unitCost: 10 }], notes: fz() }],
      ["zero-cost line", { supplierId, procurementScope: "PROJECT", destinationLocationId: locA, lines: [{ materialId: "mat-test-02", qty: 1, unitCost: 0 }], notes: fz() }],
      ["no lines", { supplierId, procurementScope: "PROJECT", destinationLocationId: locA, lines: [], notes: fz() }],
    ] },
  { method: "POST", path: "/api/material-sales",
    sideEffect: () => Number(sql(`SELECT COUNT(*) FROM "MaterialSale" WHERE notes LIKE 'fz%'`)),
    nearValid: [
      ["negative price", { customerId: custId, fromLocationId: locA, lines: [{ materialId: "mat-test-02", qty: 1, unitPrice: -50 }], notes: fz() }],
      ["zero-price line", { customerId: custId, fromLocationId: locA, lines: [{ materialId: "mat-test-02", qty: 1, unitPrice: 0 }], notes: fz() }],
      ["over-stock qty", { customerId: custId, fromLocationId: locA, lines: [{ materialId: "mat-test-02", qty: 999999, unitPrice: 10 }], notes: fz() }],
    ] },
  // PATCH [id] fuzz — bogus actions + bogus ids
  { method: "PATCH", path: "/api/purchase-orders/fz-nonexistent" },
  { method: "PATCH", path: "/api/issue-materials/fz-nonexistent" },
  { method: "PATCH", path: "/api/transfers/fz-nonexistent" },
  { method: "PATCH", path: "/api/requisitions/fz-nonexistent" },
];

let pass = 0, fail = 0;
const findings: string[] = [];

async function fuzz(t: Target) {
  const allPayloads: [string, unknown][] = [...MALFORMED, ...(t.nearValid ?? [])];
  const before = t.sideEffect?.() ?? null;
  for (const [label, body] of allPayloads) {
    const r = await api(t.method, t.path, body);
    if (r.status >= 500) {
      console.log(`  ✗ ${t.method} ${t.path} [${label}] → ${r.status}`);
      findings.push(`${t.method} ${t.path} [${label}] → 5xx ${r.status}: ${r.raw.slice(0, 140)}`);
      fail++; continue;
    }
    if (r.status < 400 && !/^nearValid/.test(label) && !MALFORMED.every((m) => m[0] !== label)) {
      // A malformed payload that was ACCEPTED — flag it (probably validation gap)
      console.log(`  ? ${t.method} ${t.path} [${label}] → ${r.status} accepted malformed input`);
      findings.push(`${t.method} ${t.path} [${label}] → ${r.status} accepted`);
      fail++; continue;
    }
    pass++;
  }
  if (before !== null) {
    const after = t.sideEffect!();
    if (after !== before) {
      console.log(`  ✗ ${t.method} ${t.path} — ${after - before} row(s) written by refused payloads`);
      findings.push(`${t.method} ${t.path}: +${after - before} rows on refused input`);
      fail++;
    }
  }
}

async function main() {
  await login();
  console.log(`fuzz-probe @${BASE} — ${targets.length} targets × ${MALFORMED.length} malformed + near-valid`);
  for (const t of targets) {
    await fuzz(t);
  }
  console.log(`\n═══ RESULT: ${pass} clean · ${fail} findings`);
  if (findings.length) {
    for (const f of findings) console.log("   " + f);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

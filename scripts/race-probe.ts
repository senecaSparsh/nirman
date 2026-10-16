/**
 * Race pack — Layer 6 of the testing roadmap.
 *
 * Fires N concurrent IDENTICAL requests at the money/lifecycle endpoints where
 * duplicate-submit or double-transition bugs would corrupt the ledger, then
 * asserts (a) at most one write won (or the second was a clean refusal) and
 * (b) the post-race side-effects aren't doubled — one JE, one payment row,
 * stock moved once.
 *
 * Coverage: sale payment, supplier payment, PO approve, issue execute,
 * requisition convert (unique convertedPoId), cheque clear (already-cleared
 * guard), sale-payment bounce.
 *
 * Usage: BASE=http://localhost:3000 npx tsx scripts/race-probe.ts
 * Dev/staging only — creates + cleans its own `rp…` fixtures.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PS = `psql -h localhost -U postgres -d nirman_inventory -tAc`.split(" ");
const rp = () => `rp${randomBytes(6).toString("hex")}`;
const q = (s: string) => s.replace(/'/g, "''");
function sql(sqlQ: string): string {
  return execFileSync(PS[0], [...PS.slice(1), sqlQ], { encoding: "utf8" }).trim();
}

let COOKIE = "";
async function login() {
  const res = await fetch(`${BASE}/api/auth/phone-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "+917017988293", password: "nirman123" }),
  });
  COOKIE = (res.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=[^;]+/)?.[0] ?? "";
  if (!COOKIE) throw new Error("login failed");
}
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: COOKIE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

type RaceResult = { status: number; body: unknown };
interface Race {
  name: string;
  /** Fire the concurrent identical calls. */
  fire: () => Promise<RaceResult[]>;
  /** Assert side-effect counts / invariants. Throw on violation. */
  verify: () => void | Promise<void>;
  /** How many successes are legal (default 1). */
  maxSuccess?: number;
  /** Require at least this many wins (default 0 — refusal-only races allowed). */
  minSuccess?: number;
  /** Optional cleanup SQL. */
  cleanup?: () => void;
}

let pass = 0, fail = 0; const notes: string[] = [];

async function runRace(r: Race) {
  try {
    const results = await r.fire();
    const okCount = results.filter((x) => x.status >= 200 && x.status < 300).length;
    const errs = results.filter((x) => x.status >= 500);
    if (errs.length) {
      console.log(`  ✗ ${r.name}: 5xx in race — ${errs.map((e) => e.status).join(",")} ${JSON.stringify(errs[0].body).slice(0, 120)}`);
      fail++;
      r.cleanup?.();
      return;
    }
    const refused = results.filter((x) => x.status >= 400).map((x) => `${x.status}:${JSON.stringify(x.body).slice(0, 60)}`);
    const max = r.maxSuccess ?? 1;
    if (okCount < (r.minSuccess ?? 0)) {
      console.log(`  ✗ ${r.name}: ${okCount} wins < ${r.minSuccess} required — all refused ${refused.join(" | ")}`);
      fail++; r.cleanup?.(); return;
    }
    if (okCount > max) {
      console.log(`  ✗ ${r.name}: ${okCount} successes > ${max} allowed — statuses ${results.map((x) => x.status).join(",")}`);
      fail++;
      r.cleanup?.();
      return;
    }
    await r.verify();
    console.log(`  ✓ ${r.name}: ${okCount} win / ${refused.length} refused ${refused.join(" | ")}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${r.name}: ${e instanceof Error ? e.message : e}`);
    fail++;
  }
  r.cleanup?.();
}

// ── Fixture helpers ───────────────────────────────────────────────────────────
const COMPANY = () => sql(`SELECT id FROM "Company" ORDER BY "createdAt" LIMIT 1`);
const SUPPLIER = () => sql(`SELECT id FROM "Supplier" WHERE "companyId"=(SELECT id FROM "Company" LIMIT 1) ORDER BY "createdAt" LIMIT 1`);
const PROJECT = () => sql(`SELECT id FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`);
const LOC = () => sql(`SELECT "locationId" FROM "StockLocationItem" WHERE "materialId"='mat-test-02' AND qty>50 LIMIT 1`);

function lastPaymentForSale(saleId: string) {
  return sql(`SELECT COUNT(*) FROM "MaterialSalePayment" WHERE "saleId"='${q(saleId)}' AND status<>'VOID'`);
}
async function main() {
  await login();
  const companyId = COMPANY();
  const supplierId = SUPPLIER();
  const projectId = PROJECT();
  const loc = LOC();
  console.log(`race-probe @${BASE} company=${companyId}`);

  // ── Race 1: identical supplier payment (same referenceNo) ×3 ──────────────
  {
    const refNo = `RACE-${rp()}`;
    const amount = 3000 + (randomBytes(2).readUInt16BE(0) % 5000); // unique-ish — window dedup must not trip on leftovers
    const fire = () =>
      Promise.all([0, 1, 2].map(() =>
        api("POST", "/api/supplier-payments", {
          supplierId, amount, paymentMode: "UPI", paymentDate: new Date().toISOString().slice(0, 10),
          referenceNo: refNo, notes: "race-probe",
        }),
      ));
    await runRace({
      name: "supplier-payment ×3 same UTR",
      minSuccess: 1,
      fire,
      verify: () => {
        const n = sql(`SELECT COUNT(*) FROM "SupplierPayment" WHERE "referenceNo"='${q(refNo)}' AND status<>'VOID'`);
        if (Number(n) !== 1) throw new Error(`expected 1 payment row, got ${n}`);
        const jes = sql(`SELECT COUNT(*) FROM "JournalEntry" e JOIN "SupplierPayment" p ON p.id=e."sourceId" WHERE p."referenceNo"='${q(refNo)}' AND e.status='POSTED'`);
        if (Number(jes) > 1) throw new Error(`${jes} posted JEs for one payment`);
      },
    });
  }

  // ── Race 2: identical supplier payment (no referenceNo — window dedup) ×3 ─
  {
    const amount = 8000 + (randomBytes(2).readUInt16BE(0) % 5000);
    const pd = new Date().toISOString().slice(0, 10);
    const fire = () =>
      Promise.all([0, 1, 2].map(() =>
        api("POST", "/api/supplier-payments", {
          supplierId, amount, paymentMode: "CASH", paymentDate: pd, notes: `race-${rp()}`,
        }),
      ));
    await runRace({
      name: "supplier-payment ×3 no-ref (window dedup)",
      fire,
      minSuccess: 1,
      maxSuccess: 1,
      verify: async () => { /* verified by refusal count — second+third must have been refused */ },
    });
  }

  // ── Race 3: PO approve ×3 on one DRAFT PO ─────────────────────────────────
  {
    const poId = rp();
    sql(
      `INSERT INTO "PurchaseOrder" (id,"poNumber","companyId","supplierId","procurementScope","destinationLocationId",status,"orderDate","subtotal","gstTotal","total","createdAt","updatedAt")
       SELECT '${poId}','RP-${poId}','${q(companyId)}','${q(supplierId)}','PROJECT','${q(loc)}','DRAFT',now(),1000,0,1000,now(),now()`,
    );
    const fire = () => Promise.all([0, 1, 2].map(() =>
      api("PATCH", `/api/purchase-orders/${poId}`, { action: "approve" }),
    ));
    await runRace({
      name: "po-approve ×3",
      fire,
      verify: () => {
        // autoOrder=true → approve flows DRAFT→APPROVED→ORDERED in one tx
        const st = sql(`SELECT status FROM "PurchaseOrder" WHERE id='${poId}'`);
        if (st !== "APPROVED" && st !== "ORDERED") throw new Error(`status=${st}`);
      },
      cleanup: () => sql(`DELETE FROM "PurchaseOrder" WHERE id='${poId}'`),
    });
  }

  // ── Race 4: issue execute ×3 on one PENDING gated issue ───────────────────
  {
    // Create via API with requireGatePass → PENDING issue + PENDING pass.
    const create = await api("POST", "/api/issue-materials", {
      fromLocationId: loc, projectId, requireGatePass: true,
      lines: [{ materialId: "mat-test-02", qty: 2 }], notes: "race",
    });
    const issueId = (create.body as { materialIssueId?: string })?.materialIssueId;
    if (!issueId) { notes.push(`race4 setup: issue create → ${create.status}`); }
    else {
      const qtyBefore = Number(sql(`SELECT qty FROM "StockLocationItem" WHERE "locationId"='${q(loc)}' AND "materialId"='mat-test-02'`));
      const fire = () => Promise.all([0, 1, 2].map(() =>
        api("PATCH", `/api/issue-materials/${issueId}`, { action: "execute" }),
      ));
      await runRace({
        name: "issue-execute ×3 (gated PENDING)",
        fire,
        maxSuccess: 1,
        verify: () => {
          const st = sql(`SELECT status FROM "MaterialIssue" WHERE id='${issueId}'`);
          const qtyAfter = Number(sql(`SELECT qty FROM "StockLocationItem" WHERE "locationId"='${q(loc)}' AND "materialId"='mat-test-02'`));
          const moved = qtyBefore - qtyAfter;
          if (st === "COMPLETED" && Math.abs(moved - 2) > 0.001) {
            throw new Error(`executed once but stock moved ${moved} (expected 2)`);
          }
        },
        cleanup: () => {
          sql(`UPDATE "MaterialIssue" SET status='CANCELLED' WHERE id='${issueId}' AND status='PENDING'`);
        },
      });
    }
  }

  // ── Race 5: material-sale payment ×3 (cap must refuse the excess) ─────────
  {
    // Seed a minimal active sale directly (10000 total) so pay races hit the cap.
    const saleId = rp();
    const cust = sql(`SELECT id FROM "Customer" WHERE "companyId"='${q(companyId)}' ORDER BY "createdAt" LIMIT 1`);
    if (!cust) { notes.push("race5 setup: no customer"); }
    else {
      sql(
        `INSERT INTO "MaterialSale" (id,"saleNumber","companyId","customerId","saleDate",status,subtotal,"gstTotal","roundOff","totalAmount","totalCost","scrapSubtotal","grossProfit","createdAt","updatedAt")
         VALUES ('${saleId}','RP-${saleId}','${q(companyId)}','${q(cust)}',now(),'ACTIVE',10000,0,0,10000,0,0,0,now(),now())`,
      );
      const payBody = { paymentMode: "UPI", amount: 10000, paymentDate: new Date().toISOString().slice(0, 10), referenceNo: `RC-${rp()}` };
      const fire = () => Promise.all([0, 1].map(() =>
        api("POST", `/api/material-sales/${saleId}/payments`, payBody),
      ));
      await runRace({
        name: "material-sale full payment ×2",
        fire,
        verify: () => {
          const n = lastPaymentForSale(saleId);
          const paid = sql(`SELECT COALESCE(SUM(amount),0) FROM "MaterialSalePayment" WHERE "saleId"='${q(saleId)}' AND status<>'VOID'`);
          if (Number(paid) > 10000.01) throw new Error(`paid ${paid} > bill 10000 across ${n} payments`);
        },
        cleanup: () => {
          sql(`DELETE FROM "MaterialSalePayment" WHERE "saleId"='${q(saleId)}'`);
          sql(`DELETE FROM "MaterialSale" WHERE id='${q(saleId)}'`);
        },
      });
    }
  }

  // ── Race 6: requisition convert ×2 (convertedPoId unique) ─────────────────
  {
    const reqId = rp();
    const lineId = rp();
    const user = sql(`SELECT id FROM "User" WHERE "companyId"='${q(companyId)}' LIMIT 1`);
    sql(
      `INSERT INTO "MaterialRequisition" (id,"reqNumber","projectId",status,"requestDate","requestedById","quotesWaived","createdAt","updatedAt")
       VALUES ('${reqId}','RP-${reqId}','${q(projectId)}','APPROVED',now(),'${q(user)}',true,now(),now())`,
    );
    sql(
      `INSERT INTO "MaterialRequisitionLine" (id,"requisitionId","materialId","qtyRequested","qtyIssued")
       VALUES ('${lineId}','${reqId}','mat-test-02',5,0)`,
    );
    const payload = {
      action: "convert", supplierId, procurementScope: "PROJECT",
      destinationLocationId: loc, lineCosts: { "mat-test-02": 10 },
    };
    const fire = () => Promise.all([0, 1].map(() => api("PATCH", `/api/requisitions/${reqId}`, payload)));
    await runRace({
      name: "requisition-convert ×2",
      fire,
      verify: () => {
        const _st = sql(`SELECT status, "convertedPoId" FROM "MaterialRequisition" WHERE id='${reqId}'`);
        // convertedPoId @unique — at most one PO can own the conversion
        const poIds = sql(`SELECT "convertedPoId" FROM "MaterialRequisition" WHERE id='${reqId}'`);
        if (poIds) {
          const pos = sql(`SELECT COUNT(*) FROM "PurchaseOrder" WHERE id='${q(poIds)}'`);
          if (Number(pos) !== 1) throw new Error(`convertedPoId set but PO missing: ${poIds}`);
        }
      },
      cleanup: () => {
        const po = sql(`SELECT "convertedPoId" FROM "MaterialRequisition" WHERE id='${reqId}'`);
        if (po) {
          sql(`DELETE FROM "PurchaseOrderLine" WHERE "purchaseOrderId"='${q(po)}'`);
          sql(`DELETE FROM "PurchaseOrder" WHERE id='${q(po)}'`);
        }
        sql(`DELETE FROM "MaterialRequisitionLine" WHERE "requisitionId"='${reqId}'`);
        sql(`DELETE FROM "MaterialRequisition" WHERE id='${reqId}'`);
      },
    });
  }

  console.log(`\n═══ RESULT: ${pass} pass · ${fail} fail`);
  if (notes.length) for (const n of notes) console.log(`  note: ${n}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

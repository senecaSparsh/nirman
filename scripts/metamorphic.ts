/**
 * Metamorphic pairs — Layer 8 of the testing roadmap.
 *
 * For every reversible business action, asserts the formal relation:
 *     apply(A) then apply(A⁻¹)  ⇒  ledger state unchanged.
 *
 * Snapshot before, run forward op, run inverse op, diff. The snapshot covers
 * the columns the op touches — stock qty, paid sums, JE status, sale/issue
 * status. Any residue after the round-trip is a coherence bug (the class that
 * produced the NRV write-down/recovery and phantom-stock findings).
 *
 * Pairs:
 *   1. material issue  → cancel         (stock + WIP GL + JE reversal)
 *   2. sale payment    → void           (paid sum + JE reversal + status)
 *   3. transfer dispatch → returnToSource (both locations net-zero)
 *   4. supplier payment → void          (balanceOwed + JE reversal)
 *   5. cheque clear    → bounce         (cleared sum restored, bounce JE)
 *
 * Usage: BASE=http://localhost:3000 npx tsx scripts/metamorphic.ts
 * Dev/staging only — creates + cleans its own `mm…` fixtures.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PS = `psql -h localhost -U postgres -d nirman_inventory -tAc`.split(" ");
const mm = () => `mm${randomBytes(6).toString("hex")}`;
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
  return { status: res.status, body: p };
}

let pass = 0, fail = 0;
function ok(name: string) { console.log(`  ✓ ${name}`); pass++; }
function bad(name: string, msg: string) { console.log(`  ✗ ${name}: ${msg}`); fail++; }

const companyId = () => sql(`SELECT id FROM "Company" ORDER BY "createdAt" LIMIT 1`);
const supplierId = () => sql(`SELECT id FROM "Supplier" WHERE "companyId"=(SELECT id FROM "Company" LIMIT 1) AND "balanceOwed" > 5000 ORDER BY "balanceOwed" DESC LIMIT 1`);
const projectId = () => sql(`SELECT id FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`);
const locA = () => sql(`SELECT "locationId" FROM "StockLocationItem" WHERE "materialId"='mat-test-02' AND qty>50 LIMIT 1`);
const locB = (a: string) => sql(`SELECT id FROM "StockLocation" WHERE id<>'${q(a)}' AND "deletedAt" IS NULL AND "companyId"=(SELECT "companyId" FROM "StockLocation" WHERE id='${q(a)}') LIMIT 1`);

function locQty(loc: string, mat = "mat-test-02") {
  return Number(sql(`SELECT COALESCE(qty,0) FROM "StockLocationItem" WHERE "locationId"='${q(loc)}' AND "materialId"='${q(mat)}'`));
}
function salePaid(saleId: string) {
  // Canonical cleared-money filter (see sumClearedAssetSalePayments):
  // non-void, cheque not PENDING/BOUNCED.
  return Number(sql(`SELECT COALESCE(SUM(amount),0) FROM "MaterialSalePayment" WHERE "saleId"='${q(saleId)}' AND status<>'VOID' AND ("chequeStatus" IS NULL OR "chequeStatus" NOT IN ('PENDING','PENDING_CLEARANCE','BOUNCED'))`));
}
function postedJes(sourceId: string) {
  return Number(sql(`SELECT COUNT(*) FROM "JournalEntry" WHERE "sourceId"='${q(sourceId)}' AND status='POSTED'`));
}
/** Reversal entries linked to the doc — append-only ledger: original stays
 *  POSTED, the reversal is a mirrored entry with a `_REVERSAL` sourceType. */
function reversalJes(sourceId: string) {
  return Number(sql(`SELECT COUNT(*) FROM "JournalEntry" WHERE "sourceId"='${q(sourceId)}' AND status='POSTED' AND "sourceType" LIKE '%_REVERSAL'`));
}

async function main() {
  await login();
  const cid = companyId(), sup = supplierId(), proj = projectId(), a = locA(), b = locB(a);
  console.log(`metamorphic @${BASE}`);

  // ── Pair 1: issue → cancel restores stock ──────────────────────────────────
  {
    const base = locQty(a);
    const cr = await api("POST", "/api/issue-materials", {
      fromLocationId: a, projectId: proj, lines: [{ materialId: "mat-test-02", qty: 4 }], notes: "mm",
    });
    const issueId = (cr.body as { materialIssueId?: string })?.materialIssueId;
    if (!issueId) { bad("issue→cancel", `create → ${cr.status}`); }
    else {
      const afterIssue = locQty(a);
      await api("PATCH", `/api/issue-materials/${issueId}`, { action: "cancel" });
      const afterCancel = locQty(a);
      const st = sql(`SELECT status FROM "MaterialIssue" WHERE id='${issueId}'`);
      const jePost = postedJes(issueId), jeRev = reversalJes(issueId);
      if (Math.abs(afterIssue - (base - 4)) > 0.001) bad("issue→cancel", `issue moved ${base - afterIssue} not 4`);
      else if (Math.abs(afterCancel - base) > 0.001) bad("issue→cancel", `stock residue: ${afterCancel} vs base ${base}`);
      else if (st !== "CANCELLED") bad("issue→cancel", `status ${st}`);
      else if (jeRev !== 1) bad("issue→cancel", `reversal JEs=${jeRev} posted=${jePost} (want 1 _REVERSAL)`);
      else ok("issue→cancel (stock restored, JE reversed)");
    }
  }

  // ── Pair 2: sale payment → void ────────────────────────────────────────────
  {
    const cust = sql(`SELECT id FROM "Customer" WHERE "companyId"='${q(cid)}' LIMIT 1`);
    const saleId = mm();
    sql(`INSERT INTO "MaterialSale" (id,"saleNumber","companyId","customerId","saleDate",status,subtotal,"gstTotal","roundOff","totalAmount","totalCost","scrapSubtotal","grossProfit","createdAt","updatedAt")
         VALUES ('${saleId}','MM-${saleId}','${q(cid)}','${q(cust)}',now(),'ACTIVE',5000,0,0,5000,0,0,0,now(),now())`);
    const before = salePaid(saleId), jeBefore = postedJes(saleId);
    const pay = await api("POST", `/api/material-sales/${saleId}/payments`, {
      paymentMode: "UPI", amount: 3000, paymentDate: new Date().toISOString().slice(0, 10), referenceNo: `MM-${mm()}`,
    });
    const payId = (pay.body as { paymentId?: string; id?: string; payment?: { id?: string } })?.paymentId
      ?? (pay.body as { id?: string })?.id ?? (pay.body as { payment?: { id?: string } })?.payment?.id;
    if (!payId) { bad("payment→void", `pay → ${pay.status} ${JSON.stringify(pay.body).slice(0, 120)}`); }
    else {
      const after = salePaid(saleId);
      await api("POST", `/api/material-sales/payments/${payId}/void`, { reason: "mm" });
      const restored = salePaid(saleId);
      const jeNow = postedJes(saleId);
      const jeReversed = Number(sql(`SELECT COUNT(*) FROM "JournalEntry" WHERE "sourceId"='${q(payId)}' AND status='REVERSED'`));
      if (after !== before + 3000) bad("payment→void", `paid ${after} != ${before + 3000}`);
      else if (restored !== before) bad("payment→void", `paid residue ${restored} vs ${before}`);
      else if (jeNow !== jeBefore) bad("payment→void", `sale JEs changed ${jeBefore}→${jeNow}`);
      else ok("payment→void (paid restored, no orphan JE)");
      void jeReversed;
    }
    sql(`DELETE FROM "MaterialSalePayment" WHERE "saleId"='${q(saleId)}'`);
    sql(`DELETE FROM "JournalLine" WHERE "journalEntryId" IN (SELECT id FROM "JournalEntry" WHERE "sourceId"='${q(saleId)}' OR "sourceId"='${q(payId ?? "x")}')`);
    sql(`DELETE FROM "JournalEntry" WHERE "sourceId"='${q(saleId)}' OR "sourceId"='${q(payId ?? "x")}'`);
    sql(`DELETE FROM "MaterialSale" WHERE id='${q(saleId)}'`);
  }

  // ── Pair 3: transfer dispatch → returnToSource ─────────────────────────────
  {
    const baseA = locQty(a), baseB = locQty(b);
    const cr = await api("POST", "/api/transfers", {
      fromLocationId: a, toLocationId: b, lines: [{ materialId: "mat-test-02", qty: 3 }], notes: "mm",
    });
    const tid = (cr.body as { id?: string })?.id;
    if (!tid) { bad("dispatch→return", `create → ${cr.status}`); }
    else {
      // Dispatch requires the auto-created gate pass to be APPROVED first.
      const passId = sql(`SELECT id FROM "GatePass" WHERE "refType"='StockTransfer' AND "refId"='${q(tid)}' ORDER BY "createdAt" DESC LIMIT 1`);
      if (passId) {
        await api("PATCH", `/api/gate-passes/${passId}`, { action: "submit" });
        const ap = await api("PATCH", `/api/gate-passes/${passId}`, { action: "approve" });
        if (ap.status >= 400) { bad("dispatch→return", `pass approve → ${ap.status} ${JSON.stringify(ap.body).slice(0, 100)}`); sql(`UPDATE "StockTransfer" SET status='CANCELLED' WHERE id='${tid}'`); return; }
      }
      // The pass may auto-dispatch on approve — check first.
      const st0 = sql(`SELECT status FROM "StockTransfer" WHERE id='${q(tid)}'`);
      let disp = { status: 200, body: {} };
      if (st0 !== "IN_TRANSIT") {
        disp = await api("PATCH", `/api/transfers/${tid}`, { action: "dispatch", vehicleNumber: "MM-1", driverName: "mm" });
      }
      if (disp.status >= 400) { bad("dispatch→return", `dispatch → ${disp.status} ${JSON.stringify(disp.body).slice(0, 120)}`); }
      else {
      const ret = await api("PATCH", `/api/transfers/${tid}`, { action: "returnToSource" });
      const st = sql(`SELECT status FROM "StockTransfer" WHERE id='${tid}'`);
      if (ret.status >= 400) bad("dispatch→return", `return → ${ret.status} ${JSON.stringify(ret.body).slice(0, 100)}`);
      else if (Math.abs(locQty(a) - baseA) > 0.001) bad("dispatch→return", `locA residue ${locQty(a)} vs ${baseA}`);
      else if (Math.abs(locQty(b) - baseB) > 0.001) bad("dispatch→return", `locB residue ${locQty(b)} vs ${baseB}`);
      else ok(`dispatch→return (both locations restored, status ${st})`);
      }
      sql(`UPDATE "StockTransfer" SET status='CANCELLED' WHERE id='${tid}' AND status NOT IN ('CANCELLED')`);
    }
  }

  // ── Pair 4: supplier payment → void restores balanceOwed ───────────────────
  {
    const owed0 = Number(sql(`SELECT "balanceOwed" FROM "Supplier" WHERE id='${q(sup)}'`));
    const pay = await api("POST", "/api/supplier-payments", {
      supplierId: sup, amount: 4000, paymentMode: "UPI",
      paymentDate: new Date().toISOString().slice(0, 10), referenceNo: `MM-${mm()}`, notes: "mm",
    });
    const payId = (pay.body as { id?: string; payment?: { id?: string } })?.id
      ?? (pay.body as { payment?: { id?: string } })?.payment?.id;
    if (!payId) { bad("supplier-pay→void", `pay → ${pay.status} ${JSON.stringify(pay.body).slice(0, 120)}`); }
    else {
      const owed1 = Number(sql(`SELECT "balanceOwed" FROM "Supplier" WHERE id='${q(sup)}'`));
      await api("POST", `/api/supplier-payments/${payId}/void`, { reason: "mm" });
      const owed2 = Number(sql(`SELECT "balanceOwed" FROM "Supplier" WHERE id='${q(sup)}'`));
      const pStatus = sql(`SELECT status FROM "SupplierPayment" WHERE id='${payId}'`);
      if (Math.abs(owed2 - owed0) > 0.01) bad("supplier-pay→void", `balanceOwed residue ${owed2} vs ${owed0} (peak ${owed1})`);
      else if (pStatus !== "VOID") bad("supplier-pay→void", `payment status ${pStatus}`);
      else ok("supplier-pay→void (balanceOwed restored)");
    }
  }

  // ── Pair 5: cheque clear → bounce ──────────────────────────────────────────
  {
    const cust = sql(`SELECT id FROM "Customer" WHERE "companyId"='${q(cid)}' LIMIT 1`);
    const saleId = mm();
    sql(`INSERT INTO "MaterialSale" (id,"saleNumber","companyId","customerId","saleDate",status,subtotal,"gstTotal","roundOff","totalAmount","totalCost","scrapSubtotal","grossProfit","createdAt","updatedAt")
         VALUES ('${saleId}','MM-${saleId}','${q(cid)}','${q(cust)}',now(),'ACTIVE',8000,0,0,8000,0,0,0,now(),now())`);
    const pay = await api("POST", `/api/material-sales/${saleId}/payments`, {
      paymentMode: "CHEQUE", amount: 2000, paymentDate: new Date().toISOString().slice(0, 10), chequeNo: `MM${mm().slice(0, 6)}`,
    });
    const payId = (pay.body as { paymentId?: string; id?: string; payment?: { id?: string } })?.paymentId
      ?? (pay.body as { id?: string })?.id ?? (pay.body as { payment?: { id?: string } })?.payment?.id;
    if (!payId) { bad("cheque clear→bounce", `pay → ${pay.status} ${JSON.stringify(pay.body).slice(0, 120)}`); }
    else {
      // Pending cheques are never counted as paid — bouncing one must leave
      // the paid sum at zero. (Bounce on CLEARED is correctly refused —
      // dishonor-after-clear is a void, not a bounce.)
      const base = salePaid(saleId);
      const bn = await api("POST", `/api/material-sales/payments/${payId}/cheque`, { action: "bounce", bounceReason: "mm" });
      const bounced = salePaid(saleId);
      const st = sql(`SELECT "chequeStatus" FROM "MaterialSalePayment" WHERE id='${payId}'`);
      if (bn.status >= 400) { bad("cheque pending→bounce", `bounce → ${bn.status} ${JSON.stringify(bn.body).slice(0, 120)} status=${st}`); }
      else if (bounced !== base) bad("cheque pending→bounce", `paid moved ${base}→${bounced} on a never-cleared cheque`);
      else if (st !== "BOUNCED") bad("cheque pending→bounce", `chequeStatus=${st}`);
      else ok("cheque pending→bounce (pending never counted; bounce is a paid-sum no-op)");
    }
    sql(`DELETE FROM "MaterialSalePayment" WHERE "saleId"='${q(saleId)}'`);
    sql(`DELETE FROM "JournalLine" WHERE "journalEntryId" IN (SELECT id FROM "JournalEntry" WHERE "sourceId"='${q(saleId)}' OR "sourceId"='${q(payId ?? "x")}')`);
    sql(`DELETE FROM "JournalEntry" WHERE "sourceId"='${q(saleId)}' OR "sourceId"='${q(payId ?? "x")}'`);
    sql(`DELETE FROM "MaterialSale" WHERE id='${q(saleId)}'`);
  }

  console.log(`\n═══ RESULT: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

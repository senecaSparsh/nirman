import { prisma } from "@nirman/db";
import {
  buildCheck,
  decimalDelta,
  type ReconciliationCheck,
  type ReconciliationDetail,
} from "./reconciliation-health";

/**
 * Entity-level invariant checks — the ledger-side regression net for the bug
 * classes found in the hardening sweeps (§44–§54). All read-only; each check
 * counts violating rows and returns a ReconciliationCheck whose `details`
 * carry the offending ids so a failure points straight at the rows.
 *
 * Invariants covered:
 *   1. StockLocationItem / MaterialLot qty never negative
 *   2. CANCELLED MaterialIssue has net-zero stock movement (no phantom
 *      ADJUSTMENT_IN without a matching ISSUE leg)
 *   3. Every JournalEntry balances (Σdebit = Σcredit)
 *   4. MaterialSale / AssetSale cleared payments never exceed the bill
 *   5. PaymentScheduleItem paidAmount within [0, totalAmount]; PAID ⇒ fully paid
 *   6. EmployeeAdvance recoveredAmount within [0, amount]; SETTLED ⇒ recovered
 *   7. PurchaseOrderLine qtyReceived ≤ qtyOrdered
 *   8. EXITED gate pass never points at a cancelled/dead parent
 *   9. StockMovement qty > 0
 *  10. MaterialRequisitionLine qtyIssued ≤ qtyRequested
 *  11. RateContract.totalReleasedQty ≤ maxQty
 */

const TOL = "0.01";

interface Violation { entityId: string; message: string }
interface RawRow { [k: string]: unknown }

function countCheck(args: {
  id: string;
  name: string;
  description: string;
  rows: Violation[];
  /** Absolute row-cap on `details` so a mass violation doesn't balloon. */
  cap?: number;
}): ReconciliationCheck {
  const n = args.rows.length;
  const details: ReconciliationDetail[] = args.rows
    .slice(0, args.cap ?? 25)
    .map((r) => ({ id: r.entityId, label: r.message, expected: "0 violations", actual: r.message, delta: r.message }));
  return buildCheck({
    id: args.id,
    name: args.name,
    description: args.description,
    expected: "0",
    actual: String(n),
    tolerance: "0",
    details,
    message: `${n} violating row(s)`,
  });
}

/** 1. No negative stock anywhere. */
export async function checkNonNegativeStock(companyId: string) {
  const items = await prisma.$queryRaw<RawRow[]>`
    SELECT id, qty FROM "StockLocationItem"
    WHERE qty < 0 AND "locationId" IN (SELECT id FROM "StockLocation" WHERE "companyId"=${companyId})`;
  const lots = await prisma.$queryRaw<RawRow[]>`
    SELECT id, "currentQty" FROM "MaterialLot" WHERE "currentQty" < 0 AND "companyId"=${companyId}`;
  return countCheck({
    id: "non-negative-stock",
    name: "Stock quantities non-negative",
    description: "No StockLocationItem or MaterialLot may carry a negative qty",
    rows: [
      ...items.map((r) => ({ entityId: String(r.id), message: `StockLocationItem qty=${r.qty}` })),
      ...lots.map((r) => ({ entityId: String(r.id), message: `MaterialLot currentQty=${r.currentQty}` })),
    ],
  });
}

/** 2. Cancelled issue must net to zero stock movement (phantom-stock guard). */
export async function checkCancelledIssueReversal(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT i.id,
      COALESCE(SUM(CASE WHEN m."movementType" IN ('ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','SALE','RETURN','TRANSFER_OUT','ADJUSTMENT_OUT') THEN m.qty ELSE 0 END),0) AS out_qty,
      COALESCE(SUM(CASE WHEN m."movementType" IN ('ADJUSTMENT_IN','PURCHASE_RECEIPT','TRANSFER_IN','SCRAP_GENERATED','OPENING_BALANCE') THEN m.qty ELSE 0 END),0) AS in_qty
    FROM "MaterialIssue" i
    LEFT JOIN "StockMovement" m ON m."refId" = i.id
    JOIN "StockLocation" loc ON loc.id = i."fromLocationId"
    WHERE i.status = 'CANCELLED' AND loc."companyId" = ${companyId}
    GROUP BY i.id
    HAVING COALESCE(SUM(CASE WHEN m."movementType" IN ('ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','SALE','RETURN','TRANSFER_OUT','ADJUSTMENT_OUT') THEN m.qty ELSE 0 END),0)
        <> COALESCE(SUM(CASE WHEN m."movementType" IN ('ADJUSTMENT_IN','PURCHASE_RECEIPT','TRANSFER_IN','SCRAP_GENERATED','OPENING_BALANCE') THEN m.qty ELSE 0 END),0)`;
  return countCheck({
    id: "cancelled-issue-reversal",
    name: "Cancelled issues reverse fully",
    description: "A CANCELLED MaterialIssue's OUT legs must equal its IN legs (PENDING issues have neither; COMPLETED cancels have both)",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `out=${r.out_qty} in=${r.in_qty}` })),
  });
}

/** 3. Every journal entry balances. */
export async function checkJournalBalance(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT e.id, SUM(l.debit) AS debits, SUM(l.credit) AS credits
    FROM "JournalEntry" e JOIN "JournalLine" l ON l."journalEntryId" = e.id
    WHERE e."companyId" = ${companyId}
    GROUP BY e.id
    HAVING ABS(SUM(l.debit) - SUM(l.credit)) > ${Number(TOL)}`;
  return countCheck({
    id: "journal-balance",
    name: "Journal entries balanced",
    description: "Σdebit = Σcredit per JournalEntry (POSTED or REVERSED)",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `dr=${r.debits} cr=${r.credits}` })),
  });
}

/** 4. Cleared payments never exceed the sale total. */
export async function checkPaymentCaps(companyId: string) {
  const ms = await prisma.$queryRaw<RawRow[]>`
    SELECT s.id, s."totalAmount", COALESCE(SUM(p.amount),0) AS paid
    FROM "MaterialSale" s LEFT JOIN "MaterialSalePayment" p
      ON p."saleId" = s.id AND p.status <> 'VOID' AND p.direction = 'IN'
      AND (p."chequeStatus" IS NULL OR p."chequeStatus" <> 'BOUNCED')
    WHERE s."companyId" = ${companyId} AND s.status <> 'CANCELLED'
    GROUP BY s.id HAVING COALESCE(SUM(p.amount),0) > s."totalAmount" + ${Number(TOL)}`;
  const as = await prisma.$queryRaw<RawRow[]>`
    SELECT s.id, (s."salePrice" + s."gstAmount") AS total, COALESCE(SUM(p.amount),0) AS paid
    FROM "AssetSale" s LEFT JOIN "AssetSalePayment" p
      ON p."assetSaleId" = s.id AND p.status <> 'VOID'
      AND (p."chequeStatus" IS NULL OR p."chequeStatus" NOT IN ('PENDING','BOUNCED'))
    WHERE s."companyId" = ${companyId} AND s.status <> 'CANCELLED'
    GROUP BY s.id HAVING COALESCE(SUM(p.amount),0) > (s."salePrice" + s."gstAmount") + ${Number(TOL)}`;
  return countCheck({
    id: "payment-caps",
    name: "Sale payments within bill",
    description: "Cleared (non-void, non-bounced) payments never exceed sale total",
    rows: [
      ...ms.map((r) => ({ entityId: String(r.id), message: `MaterialSale paid=${r.paid} total=${r.totalAmount}` })),
      ...as.map((r) => ({ entityId: String(r.id), message: `AssetSale paid=${r.paid} total=${r.total}` })),
    ],
  });
}

/** 5. PaymentScheduleItem bounds + PAID implies fully covered. */
export async function checkScheduleItemBounds(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT i.id, i.status, i."paidAmount", i."totalAmount"
    FROM "PaymentScheduleItem" i JOIN "PaymentSchedule" s ON s.id = i."paymentScheduleId"
    JOIN "AssetSale" sa ON sa.id = s."assetSaleId"
    WHERE sa."companyId" = ${companyId} AND (
      i."paidAmount" < -${Number(TOL)}
      OR i."paidAmount" > i."totalAmount" + ${Number(TOL)}
      OR (i.status = 'PAID' AND i."paidAmount" < i."totalAmount" - ${Number(TOL)})
      OR (i.status = 'WAIVED' AND i."paidAmount" > ${Number(TOL)}))`;
  return countCheck({
    id: "schedule-item-bounds",
    name: "Schedule item payment bounds",
    description: "paidAmount ∈ [0,totalAmount]; PAID ⇒ fully paid; WAIVED ⇒ zero paid",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `${r.status} paid=${r.paidAmount} total=${r.totalAmount}` })),
  });
}

/** 6. EmployeeAdvance bounds + SETTLED implies fully recovered. */
export async function checkAdvanceBounds(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT id, status, amount, "recoveredAmount"
    FROM "EmployeeAdvance"
    WHERE "companyId" = ${companyId} AND (
      "recoveredAmount" < -${Number(TOL)}
      OR "recoveredAmount" > amount + ${Number(TOL)}
      OR (status = 'SETTLED' AND "recoveredAmount" < amount - ${Number(TOL)})
      OR (status = 'CANCELLED' AND "recoveredAmount" > amount + ${Number(TOL)}))`;
  return countCheck({
    id: "advance-bounds",
    name: "Advance recovery bounds",
    description: "recoveredAmount ∈ [0,amount]; SETTLED ⇒ fully recovered",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `${r.status} recovered=${r.recoveredAmount} of ${r.amount}` })),
  });
}

/** 7. PO line received ≤ ordered. */
export async function checkPoLineBounds(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT l.id, l."qtyOrdered", l."qtyReceived"
    FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" p ON p.id = l."purchaseOrderId"
    WHERE p."companyId" = ${companyId} AND l."qtyReceived" > l."qtyOrdered" + 0.001`;
  return countCheck({
    id: "po-line-bounds",
    name: "PO lines not over-received",
    description: "qtyReceived ≤ qtyOrdered per PO line",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `received=${r.qtyReceived} ordered=${r.qtyOrdered}` })),
  });
}

/** 8. EXITED gate pass must point at a live/executed parent — never a cancelled one. */
export async function checkExitedPassLinkage(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT g.id, g."gatePassNumber", g."refType", p.dead
    FROM "GatePass" g
    LEFT JOIN LATERAL (
      SELECT CASE g."refType"
        WHEN 'MaterialIssue' THEN (SELECT 1 FROM "MaterialIssue" x WHERE x.id = g."refId" AND x.status = 'CANCELLED')
        WHEN 'StockTransfer' THEN (SELECT 1 FROM "StockTransfer" x WHERE x.id = g."refId" AND x.status = 'CANCELLED')
        WHEN 'SupplierReturn' THEN (SELECT 1 FROM "SupplierReturn" x WHERE x.id = g."refId" AND x.status = 'CANCELLED')
        WHEN 'MaterialSale'  THEN (SELECT 1 FROM "MaterialSale"  x WHERE x.id = g."refId" AND x.status = 'CANCELLED')
      END AS dead
    ) p ON true
    WHERE g.status = 'EXITED' AND g."companyId" = ${companyId} AND p.dead = 1`;
  return countCheck({
    id: "exited-pass-linkage",
    name: "Exited gate passes link to live parents",
    description: "An EXITED pass on a CANCELLED entity means goods left but the record died",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `${r.gatePassNumber} → ${r.refType} CANCELLED` })),
  });
}

/** 9. No non-positive stock movements. */
export async function checkPositiveMovements(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT m.id, m.qty, m."movementType"
    FROM "StockMovement" m
    LEFT JOIN "StockLocation" fl ON fl.id = m."fromLocationId"
    LEFT JOIN "StockLocation" tl ON tl.id = m."toLocationId"
    WHERE m.qty <= 0 AND (fl."companyId" = ${companyId} OR tl."companyId" = ${companyId})`;
  return countCheck({
    id: "positive-movements",
    name: "Stock movements positive",
    description: "Every StockMovement carries qty > 0",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `${r.movementType} qty=${r.qty}` })),
  });
}

/** 10. Requisition line issued ≤ requested. */
export async function checkRequisitionBounds(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT l.id, l."qtyRequested", l."qtyIssued"
    FROM "MaterialRequisitionLine" l JOIN "MaterialRequisition" r ON r.id = l."requisitionId"
    LEFT JOIN "Project" p ON p.id = r."projectId"
    LEFT JOIN "Department" d ON d.id = r."departmentId"
    WHERE (p."companyId" = ${companyId} OR d."companyId" = ${companyId})
      AND l."qtyIssued" > l."qtyRequested" + 0.001`;
  return countCheck({
    id: "requisition-bounds",
    name: "Requisition issue within request",
    description: "qtyIssued ≤ qtyRequested per requisition line",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `issued=${r.qtyIssued} requested=${r.qtyRequested}` })),
  });
}

/** 11. Rate-contract release within maxQty. */
export async function checkRateContractCeiling(companyId: string) {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT id, "totalReleasedQty", "maxQty"
    FROM "RateContract"
    WHERE "companyId" = ${companyId} AND "maxQty" IS NOT NULL AND "totalReleasedQty" > "maxQty" + 0.001`;
  return countCheck({
    id: "rate-contract-ceiling",
    name: "Rate contract releases within maxQty",
    description: "totalReleasedQty ≤ maxQty per contract",
    rows: rows.map((r) => ({ entityId: String(r.id), message: `released=${r.totalReleasedQty} max=${r.maxQty}` })),
  });
}

/** Run all entity-level invariant checks for a company. */
export async function runInvariantChecks(companyId: string): Promise<ReconciliationCheck[]> {
  return Promise.all([
    checkNonNegativeStock(companyId),
    checkCancelledIssueReversal(companyId),
    checkJournalBalance(companyId),
    checkPaymentCaps(companyId),
    checkScheduleItemBounds(companyId),
    checkAdvanceBounds(companyId),
    checkPoLineBounds(companyId),
    checkExitedPassLinkage(companyId),
    checkPositiveMovements(companyId),
    checkRequisitionBounds(companyId),
    checkRateContractCeiling(companyId),
  ]);
}

// Re-export so callers only need this module for both layers.
export { decimalDelta };

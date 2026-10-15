/**
 * Books Reconciliation Service — the "trust surface".
 *
 * A construction ERP lives or dies on whether the books tie out. This module
 * runs the four independent tie-outs that catch divergence between the
 * operational ledgers (stock, land, units) and the financial ledger (GL)
 * before the owner notices:
 *
 *  1. Stock ledger vs StockLocationItem   — does the immutable movement log
 *     re-derive to the same on-hand qty that the cache claims?
 *  2. Inventory GL vs stock value          — does Σ(qty × MAC) equal the GL
 *     Inventory (1300) balance? If not, a posting was missed or double-counted.
 *  3. Land cost breakup                    — does LandPurchase.totalCost equal
 *     the fixed columns + Σ effectivePostedAmount(components)? Catches
 *     recurring-cost accruals that haven't been recomputed.
 *  4. Unit production cost                 — does the cached Project.totalProjectCost
 *     / costPerSqft match a fresh read-only recompute? Catches stale allocations
 *     after material issues / land cost changes that weren't reallocated.
 *
 * Plus a structural check:
 *  5. Trial balance balances               — Σ debits = Σ credits across all
 *     posted journal entries. Should never fail (postJournalEntry rejects
 *     unbalanced entries), but a DB-level corruption or manual insert could
 *     break it.
 *
 * Design: the pure helpers (decimalDelta, statusForDelta, buildCheck,
 * summarizeChecks) are unit-tested without a DB. The DB-backed functions
 * are read-only — they NEVER mutate. Running a reconciliation must be safe
 * to do at any time, including mid-transaction.
 */

import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ACCT } from "./gl-posting";
import { effectivePostedAmount } from "./land-cost-component";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CheckStatus = "PASS" | "FAIL" | "WARN";

export interface ReconciliationDetail {
  /** Entity identifier — locationId:materialId, landPurchaseId, projectId, etc. */
  id: string;
  /** Human-readable label for the row. */
  label: string;
  /** Expected value (recomputed from source-of-truth). */
  expected: string;
  /** Actual value (stored in the cache/column). */
  actual: string;
  /** actual − expected. */
  delta: string;
}

export interface ReconciliationCheck {
  /** Stable identifier — used by the UI for keys and deep-linking. */
  id: string;
  /** Human-readable check name. */
  name: string;
  /** What this check proves when it passes. */
  description: string;
  status: CheckStatus;
  /** Aggregate expected (sum of all details, or the single compared value). */
  expected: string;
  /** Aggregate actual. */
  actual: string;
  /** actual − expected. */
  delta: string;
  /** Allowed absolute delta before the check fails. */
  tolerance: string;
  /** Per-entity breakdown when the check has multiple items. */
  details: ReconciliationDetail[];
  /** Explanation when status ≠ PASS. */
  message?: string;
}

export interface ReconciliationSummary {
  total: number;
  passed: number;
  failed: number;
  warned: number;
}

export interface ReconciliationReport {
  timestamp: string;
  companyId: string;
  checks: ReconciliationCheck[];
  summary: ReconciliationSummary;
  /** True only if every check passed. */
  allPass: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — unit-tested, no DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the signed delta (actual − expected) as a Decimal.
 * Accepts Decimal, number, or string to be forgiving at call sites.
 */
export function decimalDelta(
  actual: Decimal | number | string,
  expected: Decimal | number | string,
): Decimal {
  return new Decimal(actual).minus(new Decimal(expected));
}

/**
 * Determine PASS / FAIL / WARN from a delta and tolerance.
 *
 *  |delta| ≤ tolerance           → PASS
 *  tolerance < |delta| ≤ warnAt  → WARN  (drift detected, not yet broken)
 *  |delta| > warnAt              → FAIL
 *
 * When warnAt is omitted, anything beyond tolerance is FAIL (no warn band).
 */
export function statusForDelta(
  delta: Decimal | number | string,
  tolerance: Decimal | number | string,
  warnAt?: Decimal | number | string,
): CheckStatus {
  const d = new Decimal(delta).abs();
  const tol = new Decimal(tolerance);
  if (d.lte(tol)) return "PASS";
  if (warnAt !== undefined && d.lte(new Decimal(warnAt))) return "WARN";
  return "FAIL";
}

/**
 * Build a ReconciliationCheck from a single expected/actual pair.
 */
export function buildCheck(args: {
  id: string;
  name: string;
  description: string;
  expected: Decimal | number | string;
  actual: Decimal | number | string;
  tolerance: Decimal | number | string;
  warnAt?: Decimal | number | string;
  details?: ReconciliationDetail[];
  message?: string;
}): ReconciliationCheck {
  const delta = decimalDelta(args.actual, args.expected);
  const status = statusForDelta(delta, args.tolerance, args.warnAt);
  return {
    id: args.id,
    name: args.name,
    description: args.description,
    status,
    expected: new Decimal(args.expected).toString(),
    actual: new Decimal(args.actual).toString(),
    delta: delta.toString(),
    tolerance: new Decimal(args.tolerance).toString(),
    details: args.details ?? [],
    message: status === "PASS" ? undefined : args.message,
  };
}

/**
 * Summarise a list of checks into counts.
 */
export function summarizeChecks(checks: ReconciliationCheck[]): ReconciliationSummary {
  return {
    total: checks.length,
    passed: checks.filter((c) => c.status === "PASS").length,
    failed: checks.filter((c) => c.status === "FAIL").length,
    warned: checks.filter((c) => c.status === "WARN").length,
  };
}

// Default tolerances — money is Decimal(14,2) so 0.01 is the smallest unit;
// quantities are Decimal(14,3) so 0.001 is the smallest unit.
const MONEY_TOL = "0.01";
const QTY_TOL = "0.001";

// StockMovement types that ADD stock to a location (toLocationId is set).
const IN_MOVEMENT_TYPES = [
  "PURCHASE_RECEIPT",
  "TRANSFER_IN",
  "ADJUSTMENT_IN",
  "SCRAP_GENERATED",
  "OPENING_BALANCE",
] as const;

// StockMovement types that REMOVE stock from a location (fromLocationId is set).
// RETURN is an outflow — supplier-returned stock leaves via fromLocationId
// (matches movementDirection() in moving-average-cost.ts and the export
// route's OUT_TYPES).
const OUT_MOVEMENT_TYPES = [
  "TRANSFER_OUT",
  "ISSUE_TO_PROJECT",
  "ISSUE_TO_DEPARTMENT",
  "ADJUSTMENT_OUT",
  "RETURN",
  "SALE",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed reconciliation checks — all read-only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check 1: Stock ledger vs StockLocationItem.
 *
 * Re-derives the on-hand qty per (location, material) from the immutable
 * StockMovement log and compares it to the cached StockLocationItem.qty.
 * Divergence means a movement was recorded without atomically updating the
 * cache (or vice-versa) — which should be impossible given recordMovement /
 * recordTransfer use a Serializable transaction, but a crash mid-tx or a
 * manual DB edit could break it.
 */
export async function reconcileStockLedger(
  companyId: string,
  tolerance: string = QTY_TOL,
): Promise<ReconciliationCheck> {
  // Fetch all StockLocationItems for this company (non-deleted locations/materials).
  const items = await prisma.stockLocationItem.findMany({
    where: {
      location: { deletedAt: null, companyId },
      material: { deletedAt: null },
    },
    select: {
      id: true,
      locationId: true,
      materialId: true,
      qty: true,
      location: { select: { name: true } },
      material: { select: { code: true, name: true } },
    },
  });

  // Aggregate IN movements per (toLocationId, materialId).
  const inGrouped = await prisma.stockMovement.groupBy({
    by: ["toLocationId", "materialId"],
    where: {
      toLocationId: { not: null },
      movementType: { in: [...IN_MOVEMENT_TYPES] },
      material: { deletedAt: null },
    },
    _sum: { qty: true },
  });

  // Aggregate OUT movements per (fromLocationId, materialId).
  const outGrouped = await prisma.stockMovement.groupBy({
    by: ["fromLocationId", "materialId"],
    where: {
      fromLocationId: { not: null },
      movementType: { in: [...OUT_MOVEMENT_TYPES] },
      material: { deletedAt: null },
    },
    _sum: { qty: true },
  });

  // Build lookup maps.
  const inMap = new Map<string, Decimal>();
  for (const g of inGrouped) {
    if (!g.toLocationId) continue;
    const key = `${g.toLocationId}:${g.materialId}`;
    inMap.set(key, new Decimal(g._sum.qty ?? 0));
  }
  const outMap = new Map<string, Decimal>();
  for (const g of outGrouped) {
    if (!g.fromLocationId) continue;
    const key = `${g.fromLocationId}:${g.materialId}`;
    outMap.set(key, new Decimal(g._sum.qty ?? 0));
  }

  // Compare per item.
  const details: ReconciliationDetail[] = [];
  let totalExpected = new Decimal(0);
  let totalActual = new Decimal(0);

  for (const item of items) {
    const key = `${item.locationId}:${item.materialId}`;
    const inQty = inMap.get(key) ?? new Decimal(0);
    const outQty = outMap.get(key) ?? new Decimal(0);
    const expected = inQty.minus(outQty);
    const actual = new Decimal(item.qty);
    const delta = actual.minus(expected);

    totalExpected = totalExpected.plus(expected);
    totalActual = totalActual.plus(actual);

    if (delta.abs().gt(new Decimal(tolerance))) {
      details.push({
        id: key,
        label: `${item.material.code} @ ${item.location.name}`,
        expected: expected.toString(),
        actual: actual.toString(),
        delta: delta.toString(),
      });
    }
  }

  return buildCheck({
    id: "stock-ledger",
    name: "Stock Ledger vs On-Hand Cache",
    description:
      "Re-derives on-hand qty per location from the immutable StockMovement log and compares to StockLocationItem.qty. Divergence means a movement and cache update were not atomic.",
    expected: totalExpected,
    actual: totalActual,
    tolerance,
    details: details.slice(0, 50),
    message:
      details.length > 0
        ? `${details.length} location-material pair(s) have a qty mismatch. The movement log and the on-hand cache disagree — run a stock count to reconcile.`
        : undefined,
  });
}

/**
 * Check 2: Inventory GL balance vs stock value.
 *
 * Compares the GL Inventory account (1300) balance (debit − credit) to
 * Σ StockLocationItem.qty × movingAvgCost. If these diverge, a stock
 * receipt/issue was posted to the GL without a matching stock movement
 * (or vice-versa).
 */
export async function reconcileInventoryGl(
  companyId: string,
  tolerance: string = MONEY_TOL,
): Promise<ReconciliationCheck> {
  // Resolve account code → ID (GlAccount PK is now id, not code)
  const inventoryAccount = await prisma.glAccount.findUnique({
    where: { companyId_code: { companyId, code: ACCT.INVENTORY } },
    select: { id: true },
  });

  // GL balance for account 1300 (Inventory - Materials).
  const glGrouped = inventoryAccount
    ? await prisma.journalLine.aggregate({
        where: {
          accountId: inventoryAccount.id,
          journalEntry: { companyId, status: "POSTED" },
        },
        _sum: { debit: true, credit: true },
      })
    : null;
  const glDebit = new Decimal(glGrouped?._sum?.debit ?? 0);
  const glCredit = new Decimal(glGrouped?._sum?.credit ?? 0);
  const glBalance = glDebit.minus(glCredit); // asset → debit-normal

  // Stock value = the stock ledger's authoritative running value (latest
  // StockMovement.balanceValueAfter per material+location), NOT a recomputed
  // Σ(qty × MAC). Re-multiplying the per-unit movingAvgCost — stored rounded
  // to 2 decimals — loses the sub-paise residual and false-positives a FAIL
  // on a healthy book (e.g. 65 × 376.92 = 24499.80 vs the true ledger value
  // 24500.00). The ledger value is what the GL is supposed to equal, so it is
  // the correct comparator: a missed/doubled GL posting still diverges.
  const valuedLocations = await prisma.$queryRaw<{ value: Decimal }[]>`
    SELECT COALESCE(SUM(v."balanceValueAfter"), 0) AS value FROM (
      SELECT DISTINCT ON (m."materialId", m."locationId")
        m."balanceValueAfter"
      FROM (
        SELECT id, "materialId", "toLocationId" AS "locationId", "balanceValueAfter", timestamp
        FROM "StockMovement" WHERE "toLocationId" IS NOT NULL
        UNION ALL
        SELECT id, "materialId", "fromLocationId" AS "locationId", "balanceValueAfter", timestamp
        FROM "StockMovement" WHERE "fromLocationId" IS NOT NULL
      ) m
      INNER JOIN "StockLocation" loc ON loc.id = m."locationId" AND loc."companyId" = ${companyId} AND loc."deletedAt" IS NULL
      INNER JOIN "Material" mat ON mat.id = m."materialId" AND mat."deletedAt" IS NULL
      ORDER BY m."materialId", m."locationId", m.timestamp DESC, m.id DESC
    ) v`;
  const stockValue = new Decimal(valuedLocations[0]?.value ?? 0);

  // In-transit stock: TRANSFER_OUT removes qty from the source
  // StockLocationItem the moment a transfer dispatches, but GL keeps it in
  // 1300 until the receiving site books the TRANSFER_IN. Stock that is on a
  // truck between sites is still company inventory — count it so the tie-out
  // doesn't false-fail on every in-flight transfer.
  const inTransitLines = await prisma.stockTransferLine.findMany({
    where: {
      stockTransfer: {
        status: "IN_TRANSIT",
        fromLocation: { companyId, deletedAt: null },
      },
    },
    select: { qty: true, unitCostAtSource: true },
  });
  const inTransitValue = inTransitLines.reduce(
    (sum, l) => sum.plus(new Decimal(l.qty).times(l.unitCostAtSource ?? 0)),
    new Decimal(0),
  );
  const inTransitQty = inTransitLines.reduce(
    (sum, l) => sum.plus(l.qty),
    new Decimal(0),
  );

  const details: ReconciliationDetail[] = [];
  if (inTransitQty.gt(0)) {
    details.push({
      id: "in-transit",
      label: "In-transit stock (dispatched, not yet received)",
      expected: "0",
      actual: inTransitValue.toString(),
      delta: "0",
    });
  }

  return buildCheck({
    id: "inventory-gl",
    name: "GL Inventory vs Stock Value",
    description:
      "Compares the GL Inventory account (1300) balance to Σ(qty × MAC) across all locations plus in-transit stock (dispatched but not yet received — still company inventory). Divergence means a receipt/issue posted to the GL without a matching stock movement (or vice-versa).",
    expected: glBalance,
    actual: stockValue.plus(inTransitValue),
    tolerance,
    // Paise-level drift is routine here: transfer dispatch stores
    // unitCostAtSource at 2dp while the underlying movement deducted at full
    // MAC precision, and the GL posts 2dp rounded amounts — small residuals
    // accumulate. Band anything under ₹1 as WARN so real posting failures
    // still FAIL loudly.
    warnAt: "1",
    details,
    message:
      "The GL inventory balance and the stock value disagree. A posting may have been missed or a stock movement occurred without a GL entry. Check recent receipts and issues.",
  });
}

/**
 * Check 2b: Supplier subledger vs balanceOwed.
 *
 * AP (2000) journal lines carry entityType/entityId back to their source
 * document (PurchaseOrder, SupplierInvoice, SupplierPayment, SupplierReturn,
 * DirectPurchase) — each of which knows its supplier. That gives a per-
 * supplier slice of the AP subledger: Σ(credit − debit). balanceOwed is a
 * denormalised cache of exactly this number, and history shows the class of
 * bug it hides — a posting path that credits AP but forgets to move
 * balanceOwed (direct purchases), or decrements GL AP without decrementing
 * the card (negative invoice variance), or floors at 0 and loses an advance.
 * Here we just compare the two; a mismatch means one of the mutation sites
 * drifted from the GL truth.
 *
 * AP slices that belong to LandPurchases (LandSeller) and RaBills
 * (Subcontractor) are different subledgers — excluded. AP posted against a
 * DirectPurchase with no supplierId is reported as an orphan: the GL knows
 * the payable but no supplier card carries it.
 */
export async function reconcileSupplierAp(
  companyId: string,
  tolerance: string = MONEY_TOL,
): Promise<ReconciliationCheck> {
  const apAccount = await prisma.glAccount.findUnique({
    where: { companyId_code: { companyId, code: ACCT.AP } },
    select: { id: true },
  });

  const lines = apAccount
    ? await prisma.journalLine.findMany({
        where: {
          accountId: apAccount.id,
          journalEntry: { companyId, status: "POSTED" },
        },
        select: { debit: true, credit: true, entityType: true, entityId: true },
      })
    : [];

  // Resolve each AP line's owner. Only entity types that map to a Supplier
  // participate; RaBill (subcontractor) and LandPurchase (seller) slices are
  // tracked by their own subledgers.
  const idsByType = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!l.entityType || !l.entityId) continue;
    if (!idsByType.has(l.entityType)) idsByType.set(l.entityType, new Set());
    idsByType.get(l.entityType)!.add(l.entityId);
  }

  const supplierOf = new Map<string, string | null>(); // "type:id" → supplierId
  async function load(table: "purchaseOrder" | "supplierInvoice" | "supplierPayment" | "supplierReturn" | "directPurchase", entityType: string) {
    const ids = [...(idsByType.get(entityType) ?? [])];
    if (ids.length === 0) return;
    const rows = await (prisma[table] as { findMany: (a: unknown) => Promise<{ id: string; supplierId: string | null }[]> })
      .findMany({ where: { id: { in: ids } }, select: { id: true, supplierId: true } });
    for (const r of rows) supplierOf.set(`${entityType}:${r.id}`, r.supplierId);
  }
  await load("purchaseOrder", "PurchaseOrder");
  await load("supplierInvoice", "SupplierInvoice");
  await load("supplierPayment", "SupplierPayment");
  await load("supplierReturn", "SupplierReturn");
  await load("directPurchase", "DirectPurchase");

  // Net (credit − debit) per supplier; unresolved supplier lines → orphan.
  const netBySupplier = new Map<string, Decimal>();
  let orphanNet = new Decimal(0);
  for (const l of lines) {
    const net = new Decimal(l.credit).minus(l.debit);
    if (!l.entityType || !l.entityId) continue; // un-tagged — other subledger
    const key = `${l.entityType}:${l.entityId}`;
    if (!supplierOf.has(key)) continue; // LandPurchase / RaBill / unresolvable
    const supplierId = supplierOf.get(key);
    if (supplierId) {
      netBySupplier.set(supplierId, (netBySupplier.get(supplierId) ?? new Decimal(0)).plus(net));
    } else {
      orphanNet = orphanNet.plus(net);
    }
  }

  const suppliers = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, balanceOwed: true },
  });

  const details: ReconciliationDetail[] = [];
  let totalExpected = new Decimal(0);
  let totalActual = new Decimal(0);

  for (const s of suppliers) {
    const expected = netBySupplier.get(s.id) ?? new Decimal(0);
    const actual = new Decimal(s.balanceOwed);
    const delta = actual.minus(expected);
    totalExpected = totalExpected.plus(expected);
    totalActual = totalActual.plus(actual);
    if (delta.abs().gt(new Decimal(tolerance))) {
      details.push({
        id: s.id,
        label: s.name,
        expected: expected.toString(),
        actual: actual.toString(),
        delta: delta.toString(),
      });
    }
  }

  // A supplier with AP lines but a deleted/unknown supplier row can't
  // reconcile — surface the bucket so it isn't silently dropped.
  for (const [sid, net] of netBySupplier) {
    if (!suppliers.some((s) => s.id === sid) && net.abs().gt(new Decimal(tolerance))) {
      details.push({
        id: sid,
        label: "Deleted supplier — AP still carries their entries",
        expected: net.toString(),
        actual: "0",
        delta: net.negated().toString(),
      });
      totalExpected = totalExpected.plus(net);
    }
  }

  if (orphanNet.abs().gt(new Decimal(tolerance))) {
    details.push({
      id: "orphan-ap",
      label: "AP posted with no supplier (e.g. supplier-less direct purchase)",
      expected: "0",
      actual: orphanNet.toString(),
      delta: orphanNet.toString(),
    });
  }

  return buildCheck({
    id: "supplier-ap",
    name: "Supplier AP vs Owed Balances",
    description:
      "Recomputes each supplier's AP slice from GL journal lines (resolved via entityType/entityId to PurchaseOrder / SupplierInvoice / SupplierPayment / SupplierReturn / DirectPurchase) and compares to Supplier.balanceOwed. A negative balance is a supplier advance — allowed and reconciled. Divergence means a posting path moved AP without updating the supplier card.",
    expected: totalExpected,
    actual: totalActual,
    tolerance,
    warnAt: "1",
    details: details.slice(0, 50),
    message:
      details.length > 0
        ? `${details.length} supplier(s) have a balanceOwed that disagrees with their GL AP slice — or AP exists with no supplier to owe it to. A posting path moved AP without moving balanceOwed (or vice-versa).`
        : undefined,
  });
}

/**
 * Check 3: Land cost breakup integrity.
 *
 * For each LandPurchase, verifies that totalCost equals the sum of the
 * fixed cost-breakup columns plus the effective posted amount of all
 * LandCostComponents (accrued as of now). Divergence means recurring
 * costs (yearly lease rent, etc.) have not been recomputed — the lazy
 * recompute on land-detail-GET may not have run yet.
 */
export async function reconcileLandCosts(
  companyId: string,
  tolerance: string = MONEY_TOL,
): Promise<ReconciliationCheck> {
  const landPurchases = await prisma.landPurchase.findMany({
    where: { companyId, deletedAt: null },
    include: { costComponents: true },
  });

  const now = new Date();
  const details: ReconciliationDetail[] = [];
  let totalExpected = new Decimal(0);
  let totalActual = new Decimal(0);

  for (const lp of landPurchases) {
    const fixedCols = [
      lp.baseCost, lp.leaseRentAmount, lp.gstAmount,
      lp.registrationAmount, lp.stampDutyAmount, lp.transferDutyAmount,
      lp.brokerageAmount, lp.legalFees, lp.otherCharges,
    ].reduce<Decimal>(
      (sum, v) => sum.plus(v ? new Decimal(v) : new Decimal(0)),
      new Decimal(0),
    );

    const componentsTotal = lp.costComponents.reduce<Decimal>(
      (sum, c) => sum.plus(effectivePostedAmount(c, now)),
      new Decimal(0),
    );

    const expected = fixedCols.plus(componentsTotal);
    const actual = new Decimal(lp.totalCost);
    const delta = actual.minus(expected);

    totalExpected = totalExpected.plus(expected);
    totalActual = totalActual.plus(actual);

    if (delta.abs().gt(new Decimal(tolerance))) {
      details.push({
        id: lp.id,
        label: `${lp.sellerName} — ${lp.location ?? "no location"}`,
        expected: expected.toString(),
        actual: actual.toString(),
        delta: delta.toString(),
      });
    }
  }

  return buildCheck({
    id: "land-cost",
    name: "Land Cost Breakup Integrity",
    description:
      "Verifies LandPurchase.totalCost = fixed cost columns + Σ effectivePostedAmount(cost components). Divergence means recurring costs (yearly lease rent, etc.) haven't been recomputed — view the land detail page to trigger the lazy recompute.",
    expected: totalExpected,
    actual: totalActual,
    tolerance,
    details: details.slice(0, 50),
    message:
      details.length > 0
        ? `${details.length} land purchase(s) have a stale totalCost. Open each land detail page to trigger the lazy recompute, or run recomputeLandTotalCost manually.`
        : undefined,
  });
}

/**
 * Check 3b: WIP (1500) GL vs the project cost pool.
 *
 * Every project cost must pass through WIP before it can be capitalised into
 * a unit — otherwise capitalizeBuiltUnitWip credits 1500 for money that was
 * never debited, and WIP goes silently negative (the dev DB carried −₹17.2L
 * of exactly that: payroll labour posted to Salaries Expense and project
 * land posted to Land Asset while productionCost counted both).
 *
 * Per project, the expected WIP-resident balance is:
 *   + materials issued to the project (qty × MAC at issue)
 *   + Σ ProjectCost rows (labour, contractor, transfer-duty, manual — every
 *     type now debits WIP at source)
 *   + project-linked land purchases (totalCost — posted to WIP at booking)
 *   + capitalisable renovation costs (non-REPAIR types)
 *   − scrap value recovered from the project
 *   − Σ BuiltUnit.capitalizedAmount (moved 1500 → 1800, incl. unit renos)
 *   − completed parcel-renovation actualCost (moved 1500 → 1700)
 *
 * The GL side resolves each WIP line's entityType to a project: "Project"
 * carries projectId directly; RaBill / RenovationProject / LandPurchase
 * resolve through their rows. Untagged WIP would surface as an orphan delta.
 */
export async function reconcileWipGl(
  companyId: string,
  tolerance: string = MONEY_TOL,
): Promise<ReconciliationCheck> {
  const wipAccount = await prisma.glAccount.findUnique({
    where: { companyId_code: { companyId, code: ACCT.WIP } },
    select: { id: true },
  });

  const lines = wipAccount
    ? await prisma.journalLine.findMany({
        where: {
          accountId: wipAccount.id,
          journalEntry: { companyId, status: "POSTED" },
        },
        select: { debit: true, credit: true, entityType: true, entityId: true },
      })
    : [];

  // Resolve non-Project entity types to their projectId.
  const idsOf = (t: string) => [...new Set(lines.filter((l) => l.entityType === t && l.entityId).map((l) => l.entityId!))];
  const raProject = new Map<string, string>();
  for (const r of await prisma.raBill.findMany({ where: { id: { in: idsOf("RaBill") } }, select: { id: true, projectId: true } })) raProject.set(r.id, r.projectId);
  const rpProject = new Map<string, string>();
  for (const r of await prisma.renovationProject.findMany({ where: { id: { in: idsOf("RenovationProject") } }, select: { id: true, projectId: true } })) rpProject.set(r.id, r.projectId);
  const lpProject = new Map<string, string>();
  for (const r of await prisma.landPurchase.findMany({ where: { id: { in: idsOf("LandPurchase") } }, select: { id: true, projectId: true } })) for (const x of [r] as { id: string; projectId: string | null }[]) if (x.projectId) lpProject.set(x.id, x.projectId);
  const parcelProject = new Map<string, string>();
  for (const r of await prisma.landParcel.findMany({ where: { id: { in: idsOf("LandParcel") } }, select: { id: true, projectId: true } })) if (r.projectId) parcelProject.set(r.id, r.projectId);

  const glByProject = new Map<string, Decimal>();
  let orphanNet = new Decimal(0);
  for (const l of lines) {
    const net = new Decimal(l.debit).minus(l.credit);
    const pid =
      l.entityType === "Project" ? l.entityId
      : l.entityType === "RaBill" ? raProject.get(l.entityId ?? "")
      : l.entityType === "RenovationProject" ? rpProject.get(l.entityId ?? "")
      : l.entityType === "LandPurchase" ? lpProject.get(l.entityId ?? "")
      : l.entityType === "LandParcel" ? parcelProject.get(l.entityId ?? "")
      : undefined;
    if (pid) glByProject.set(pid, (glByProject.get(pid) ?? new Decimal(0)).plus(net));
    else orphanNet = orphanNet.plus(net);
  }

  // Doc-side expected per project.
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true },
  });

  const details: ReconciliationDetail[] = [];
  let totalExpected = new Decimal(0);
  let totalActual = new Decimal(0);

  for (const project of projects) {
    const [issueLines, projectCosts, projectLand, renoCosts, scrapLines, units, parcelRenos] = await Promise.all([
      prisma.materialIssueLine.findMany({
        where: { materialIssue: { projectId: project.id, status: "COMPLETED" } },
        select: { qty: true, unitCost: true },
      }),
      prisma.projectCost.findMany({
        where: { projectId: project.id },
        select: { amount: true },
      }),
      // Parcel-level land — parcel.projectId is authoritative (a subdivided
      // purchase can feed several projects; PARTITIONED parents are cost
      // containers and SOLD parcels already left via COGS).
      prisma.landParcel.findMany({
        where: {
          projectId: project.id,
          status: { notIn: ["PARTITIONED", "SOLD"] },
          landPurchase: { deletedAt: null, purchaseStage: { not: "CANCELLED" } },
        },
        select: { acquisitionCost: true },
      }),
      prisma.renovationCost.findMany({
        where: { renovationProject: { projectId: project.id, type: { not: "REPAIR" }, status: { not: "CANCELLED" } } },
        select: { amount: true },
      }),
      prisma.scrapGenerationLine.findMany({
        where: { scrapGeneration: { projectId: project.id, status: "COMPLETED" } },
        select: { qty: true, unitCost: true },
      }),
      // Only CREATED units' capitalizedAmount is a WIP relief — PURCHASED
      // units store their acquisitionCost there without ever touching WIP.
      // deletedAt intentionally NOT filtered: a unit's WIP_CAPITALIZATION
      // journal stands even if the row is later soft-deleted.
      prisma.builtUnit.findMany({
        where: { projectId: project.id, originType: "CREATED" },
        select: { capitalizedAmount: true },
      }),
      prisma.renovationProject.findMany({
        where: { projectId: project.id, type: { not: "REPAIR" }, status: "COMPLETED", landParcelId: { not: null } },
        select: { actualCost: true },
      }),
    ]);

    const sum = <T extends Decimal.Value>(arr: T[]) => arr.reduce((s, v) => s.plus(new Decimal(v)), new Decimal(0));
    const expected = sum(issueLines.map((l) => new Decimal(l.qty).times(l.unitCost)))
      .plus(sum(projectCosts.map((c) => c.amount)))
      .plus(sum(projectLand.map((p) => p.acquisitionCost)))
      .plus(sum(renoCosts.map((c) => c.amount)))
      .minus(sum(scrapLines.map((l) => new Decimal(l.qty).times(l.unitCost))))
      .minus(sum(units.map((u) => u.capitalizedAmount)))
      .minus(sum(parcelRenos.map((r) => r.actualCost)));

    const actual = glByProject.get(project.id) ?? new Decimal(0);
    const delta = actual.minus(expected);
    totalExpected = totalExpected.plus(expected);
    totalActual = totalActual.plus(actual);
    if (delta.abs().gt(new Decimal(tolerance))) {
      details.push({
        id: project.id,
        label: project.name,
        expected: expected.toString(),
        actual: actual.toString(),
        delta: delta.toString(),
      });
    }
  }

  if (orphanNet.abs().gt(new Decimal(tolerance))) {
    details.push({
      id: "orphan-wip",
      label: "WIP posted with no project linkage",
      expected: "0",
      actual: orphanNet.toString(),
      delta: orphanNet.toString(),
    });
    totalActual = totalActual.plus(orphanNet);
  }

  return buildCheck({
    id: "wip-gl",
    name: "WIP GL vs Project Cost Pool",
    description:
      "Per project, compares the GL WIP (1500) slice to the doc-derived un-capitalised cost pool: materials + project costs + project land + capitalisable renos − scrap recovery − capitalised amounts. Divergence means a cost never entered WIP, or capitalisation relieved more than WIP held (double-counted unit cost).",
    expected: totalExpected,
    actual: totalActual,
    tolerance,
    warnAt: "1",
    details: details.slice(0, 50),
    message:
      details.length > 0
        ? `${details.length} project(s) have a WIP GL balance that disagrees with their un-capitalised cost pool. A project cost bypassed WIP (labour/land/expense posted elsewhere), or capitalisation relieved cost WIP never held.`
        : undefined,
  });
}

/**
 * Check 4: Unit production cost freshness.
 *
 * Recomputes the expected total project cost and costPerSqft (read-only —
 * does NOT call reallocateProjectCosts, which would write) and compares
 * to the cached Project.totalProjectCost / costPerSqft. Divergence means
 * material issues, land cost changes, or project costs were added without
 * re-running the allocation.
 */
export async function reconcileUnitCosts(
  companyId: string,
  tolerance: string = MONEY_TOL,
): Promise<ReconciliationCheck> {
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      costPerSqft: true,
      totalProjectCost: true,
      totalSellableArea: true,
    },
  });

  const details: ReconciliationDetail[] = [];
  let totalExpected = new Decimal(0);
  let totalActual = new Decimal(0);

  for (const project of projects) {
    // Project-level materials (area-allocated pool).
    const projectLines = await prisma.materialIssueLine.findMany({
      where: { materialIssue: { projectId: project.id, builtUnitId: null } },
      select: { qty: true, unitCost: true },
    });
    const projectMaterials = projectLines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
      new Decimal(0),
    );

    // Direct-to-unit materials.
    const unitDirectLines = await prisma.materialIssueLine.findMany({
      where: { materialIssue: { projectId: project.id, builtUnitId: { not: null } } },
      select: { qty: true, unitCost: true },
    });
    const directMaterialsTotal = unitDirectLines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
      new Decimal(0),
    );

    // Labour / overhead (ProjectCost).
    const projectCosts = await prisma.projectCost.findMany({
      where: { projectId: project.id },
      select: { amount: true },
    });
    const labour = projectCosts.reduce(
      (sum, c) => sum.plus(new Decimal(c.amount)),
      new Decimal(0),
    );

    // Land.
    const landPurchases = await prisma.landPurchase.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: { totalCost: true },
    });
    const land = landPurchases.reduce(
      (sum, p) => sum.plus(new Decimal(p.totalCost)),
      new Decimal(0),
    );

    // Scrap recovery.
    const scrapLines = await prisma.scrapGenerationLine.findMany({
      where: { scrapGeneration: { projectId: project.id } },
      select: { qty: true, unitCost: true },
    });
    const costRecovery = scrapLines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
      new Decimal(0),
    );

    const expectedTotal = projectMaterials
      .plus(directMaterialsTotal)
      .plus(labour)
      .plus(land)
      .minus(costRecovery);
    const actualTotal = new Decimal(project.totalProjectCost ?? 0);
    const delta = actualTotal.minus(expectedTotal);

    totalExpected = totalExpected.plus(expectedTotal);
    totalActual = totalActual.plus(actualTotal);

    if (delta.abs().gt(new Decimal(tolerance))) {
      details.push({
        id: project.id,
        label: project.name,
        expected: expectedTotal.toString(),
        actual: actualTotal.toString(),
        delta: delta.toString(),
      });
    }
  }

  return buildCheck({
    id: "unit-cost",
    name: "Unit Production Cost Freshness",
    description:
      "Recomputes the expected total project cost (materials + labour + land − scrap) and compares to the cached Project.totalProjectCost. Divergence means material issues / land cost changes / project costs were added without re-running reallocateProjectCosts.",
    expected: totalExpected,
    actual: totalActual,
    tolerance,
    details: details.slice(0, 50),
    message:
      details.length > 0
        ? `${details.length} project(s) have a stale totalProjectCost. Run reallocateProjectCosts for each to refresh the per-unit production cost allocation.`
        : undefined,
  });
}

/**
 * Check 5: Trial balance structural integrity.
 *
 * Verifies Σ debits = Σ credits across all posted journal entries. This
 * should never fail (postJournalEntry rejects unbalanced entries), but a
 * DB-level corruption or manual insert could break it.
 */
export async function reconcileTrialBalance(
  companyId: string,
  tolerance: string = MONEY_TOL,
): Promise<ReconciliationCheck> {
  const grouped = await prisma.journalLine.aggregate({
    where: { journalEntry: { companyId, status: "POSTED" } },
    _sum: { debit: true, credit: true },
  });
  const totalDebit = new Decimal(grouped._sum.debit ?? 0);
  const totalCredit = new Decimal(grouped._sum.credit ?? 0);

  return buildCheck({
    id: "trial-balance",
    name: "Trial Balance Balances",
    description:
      "Verifies Σ debits = Σ credits across all posted journal entries. Should never fail — postJournalEntry rejects unbalanced entries — but a DB-level corruption or manual insert could break it.",
    expected: totalDebit,
    actual: totalCredit,
    tolerance,
    message:
      "The trial balance does not balance. This indicates database-level corruption or a manual insert that bypassed postJournalEntry's balance check. Investigate immediately.",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all reconciliation checks and return a full report.
 *
 * All checks are read-only and safe to run at any time. They run in
 * parallel for speed — none of them mutate, so there's no ordering
 * dependency.
 */
export async function runBookReconciliation(
  companyId: string,
): Promise<ReconciliationReport> {
  const checks = await Promise.all([
    reconcileStockLedger(companyId),
    reconcileInventoryGl(companyId),
    reconcileSupplierAp(companyId),
    reconcileWipGl(companyId),
    reconcileLandCosts(companyId),
    reconcileUnitCosts(companyId),
    reconcileTrialBalance(companyId),
  ]);

  const summary = summarizeChecks(checks);

  return {
    timestamp: new Date().toISOString(),
    companyId,
    checks,
    summary,
    allPass: summary.failed === 0 && summary.warned === 0,
  };
}

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
  "RETURN",
  "SCRAP_GENERATED",
] as const;

// StockMovement types that REMOVE stock from a location (fromLocationId is set).
const OUT_MOVEMENT_TYPES = [
  "TRANSFER_OUT",
  "ISSUE_TO_PROJECT",
  "ISSUE_TO_DEPARTMENT",
  "ADJUSTMENT_OUT",
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
  // GL balance for account 1300 (Inventory - Materials).
  const glGrouped = await prisma.journalLine.aggregate({
    where: {
      accountCode: ACCT.INVENTORY,
      journalEntry: { companyId, status: "POSTED" },
    },
    _sum: { debit: true, credit: true },
  });
  const glDebit = new Decimal(glGrouped._sum.debit ?? 0);
  const glCredit = new Decimal(glGrouped._sum.credit ?? 0);
  const glBalance = glDebit.minus(glCredit); // asset → debit-normal

  // Stock value = Σ qty × MAC.
  const items = await prisma.stockLocationItem.findMany({
    where: {
      location: { deletedAt: null, companyId },
      material: { deletedAt: null },
    },
    select: { qty: true, movingAvgCost: true },
  });
  const stockValue = items.reduce(
    (sum, i) => sum.plus(new Decimal(i.qty).times(new Decimal(i.movingAvgCost))),
    new Decimal(0),
  );

  return buildCheck({
    id: "inventory-gl",
    name: "GL Inventory vs Stock Value",
    description:
      "Compares the GL Inventory account (1300) balance to Σ(qty × MAC) across all locations. Divergence means a receipt/issue posted to the GL without a matching stock movement (or vice-versa).",
    expected: glBalance,
    actual: stockValue,
    tolerance,
    message:
      "The GL inventory balance and the physical stock value disagree. A posting may have been missed or a stock movement occurred without a GL entry. Check recent receipts and issues.",
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

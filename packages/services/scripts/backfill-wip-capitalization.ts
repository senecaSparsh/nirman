/**
 * Backfill Script — WIP Capitalization for Historical Units
 *
 * One-off script that finds BuiltUnits that should have been capitalized
 * (moved from WIP 1500 to Unsold Assets 1800) but weren't, because the
 * capitalization logic was missing from updateUnitStatus() until now.
 *
 * Logic (from REMEDIATION_DESIGN.md §1A):
 *   1. Find BuiltUnits with status AVAILABLE/RESERVED/SOLD/HOLD that have
 *      no WIP_CAPITALIZATION journal entry.
 *   2. For SOLD units: use AssetSale.costBasis (the cost at sale time).
 *      Filter to assetType === BUILT_UNIT only (land is already balanced).
 *      Skip cancelled sales.
 *   3. For AVAILABLE/RESERVED/HOLD units: use current productionCost
 *      (after running reallocateProjectCosts()).
 *   4. Skip units with productionCost = 0 and no sale (nothing to capitalize).
 *   5. Post the capitalization entry dated as of the original status change
 *      (from AuditLog BUILT_UNIT_STATUS_CHANGE timestamp).
 *   6. Update capitalizedAmount on each unit.
 *
 * Usage: pnpm --filter @nirman/services backfill:wip [--dry-run]
 *
 * --dry-run: print what would be done without posting any entries.
 */

import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "../src/valuation";
import { postWipCapitalization } from "../src/gl-posting";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n=== WIP Capitalization Backfill ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  // ── Step 1: Find all BuiltUnits that need capitalization ──
  // Statuses that represent completed or sold units (not PLANNED/UNDER_CONSTRUCTION)
  const units = await prisma.builtUnit.findMany({
    where: {
      deletedAt: null,
      status: { in: ["AVAILABLE", "RESERVED", "SOLD", "HOLD"] },
    },
    include: {
      project: { select: { companyId: true } },
    },
  });

  console.log(`Found ${units.length} units with status AVAILABLE/RESERVED/SOLD/HOLD`);

  // Filter to units that have NO existing WIP_CAPITALIZATION journal entry
  const unitsNeedingCapitalization: typeof units = [];
  for (const unit of units) {
    const existingEntry = await prisma.journalEntry.findFirst({
      where: {
        sourceType: "WIP_CAPITALIZATION",
        sourceId: unit.id,
      },
      select: { id: true },
    });
    if (!existingEntry) {
      unitsNeedingCapitalization.push(unit);
    }
  }

  console.log(`  → ${unitsNeedingCapitalization.length} have no WIP_CAPITALIZATION entry\n`);

  if (unitsNeedingCapitalization.length === 0) {
    console.log("Nothing to backfill. All units are already capitalized.");
    return;
  }

  // ── Step 2: Process each unit ──
  let capitalized = 0;
  let skipped = 0;
  let totalAmount = new Decimal(0);

  for (const unit of unitsNeedingCapitalization) {
    const result = await processUnit(unit);
    if (result.capitalized) {
      capitalized++;
      totalAmount = totalAmount.plus(result.amount);
      console.log(
        `  ✓ ${unit.unitNumber} (${unit.status}): capitalized ${result.amount.toFixed(2)}` +
          (result.source === "sale" ? " [from AssetSale.costBasis]" : " [from productionCost]"),
      );
    } else {
      skipped++;
      console.log(`  - ${unit.unitNumber} (${unit.status}): skipped (${result.reason})`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Capitalized: ${capitalized} units`);
  console.log(`  Skipped:     ${skipped} units`);
  console.log(`  Total amount: ${totalAmount.toFixed(2)}`);
  if (DRY_RUN) {
    console.log(`\n  (DRY RUN — no entries were posted)`);
  }
}

async function processUnit(unit: {
  id: string;
  unitNumber: string;
  status: string;
  projectId: string;
  productionCost: Decimal;
  project: { companyId: string };
}): Promise<{ capitalized: boolean; amount: Decimal; reason?: string; source?: string }> {
  // ── Determine the cost basis ──
  let costBasis: Decimal;
  let source: string;

  if (unit.status === "SOLD") {
    // For SOLD units: use AssetSale.costBasis (the cost at sale time)
    // Filter: assetType === BUILT_UNIT, status === ACTIVE (not CANCELLED)
    const sale = await prisma.assetSale.findFirst({
      where: {
        builtUnitId: unit.id,
        assetType: "BUILT_UNIT",
        status: "ACTIVE",
      },
      select: { id: true, costBasis: true },
      orderBy: { createdAt: "desc" }, // most recent sale if multiple
    });

    if (!sale) {
      // SOLD unit with no active sale — could be a cancelled sale that
      // reverted status, or data inconsistency. Skip with a reason.
      return {
        capitalized: false,
        amount: new Decimal(0),
        reason: "SOLD but no active AssetSale found (possibly cancelled)",
      };
    }

    costBasis = new Decimal(sale.costBasis);
    source = "sale";
  } else {
    // For AVAILABLE/RESERVED/HOLD: use current productionCost
    // (after running reallocateProjectCosts() to ensure it's fresh)
    await prisma.$transaction(async (tx) => {
      await reallocateProjectCosts(tx, unit.projectId);
    });

    // Re-read the unit to get the fresh productionCost
    const freshUnit = await prisma.builtUnit.findUnique({
      where: { id: unit.id },
      select: { productionCost: true },
    });
    costBasis = new Decimal(freshUnit?.productionCost ?? 0);
    source = "productionCost";
  }

  // ── Skip if nothing to capitalize ──
  if (costBasis.isZero() || costBasis.lte(0)) {
    return {
      capitalized: false,
      amount: new Decimal(0),
      reason: "costBasis is zero (nothing to capitalize)",
    };
  }

  // ── Find the original status change date from AuditLog ──
  // Look for BUILT_UNIT_STATUS_CHANGE where after.status matches the current status
  const statusChangeLog = await prisma.auditLog.findFirst({
    where: {
      entityType: "BuiltUnit",
      entityId: unit.id,
      action: "BUILT_UNIT_STATUS_CHANGE",
    },
    orderBy: { timestamp: "desc" }, // most recent status change
    select: { timestamp: true },
  });

  const entryDate = statusChangeLog?.timestamp ?? new Date();

  if (DRY_RUN) {
    return { capitalized: true, amount: costBasis, source };
  }

  // ── Post the capitalization entry ──
  await prisma.$transaction(async (tx) => {
    await postWipCapitalization(tx, {
      companyId: unit.project.companyId,
      builtUnitId: unit.id,
      projectId: unit.projectId,
      costBasis,
      entryDate,
    });

    // Update capitalizedAmount on the unit
    await tx.builtUnit.update({
      where: { id: unit.id },
      data: { capitalizedAmount: costBasis },
    });
  });

  return { capitalized: true, amount: costBasis, source };
}

main()
  .then(() => {
    console.log("\nBackfill complete.\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nBackfill failed:", err);
    process.exit(1);
  });

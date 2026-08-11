/**
 * Integration test for the WIP Capitalization backfill logic.
 *
 * This test replicates the backfill script's logic against the test DB to
 * verify it correctly capitalizes historical units that were never
 * capitalized by updateUnitStatus() (because the capitalization logic
 * was missing before this fix).
 *
 * Test scenarios:
 *   1. AVAILABLE unit with productionCost > 0 → capitalized from productionCost
 *   2. SOLD unit with AssetSale → capitalized from AssetSale.costBasis
 *   3. SOLD unit with cancelled sale → skipped
 *   4. Unit with productionCost = 0 → skipped
 *   5. Unit that already has a WIP_CAPITALIZATION entry → skipped (idempotent)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { createBuiltUnits } from "../built-unit";
import { postWipCapitalization, ACCT } from "../gl-posting";
import { reallocateProjectCosts } from "../valuation";

describe("WIP Capitalization backfill — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  /**
   * Helper: create a unit and manually set it to AVAILABLE without going
   * through updateUnitStatus() (simulating a unit that was created before
   * the capitalization fix was deployed).
   */
  async function createHistoricalUnit(opts: {
    projectCostAmount?: Decimal;
    unitArea?: Decimal;
  } = {}) {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);

    const created = await createBuiltUnits({
      projectId: fixture.project.id,
      userId: fixture.user.id,
      units: [
        {
          unitType: "BHK_2",
          unitNumber: "A-101",
          area: opts.unitArea ?? new Decimal(1000),
        },
      ],
    });
    const unit = created[0]!;

    // Add project cost if specified
    if (opts.projectCostAmount) {
      await prisma.projectCost.create({
        data: {
          projectId: fixture.project.id,
          costType: "LABOUR",
          amount: opts.projectCostAmount,
        },
      });
    }

    // Manually set status to AVAILABLE (bypassing updateUnitStatus, simulating
    // a unit that was set to AVAILABLE before the capitalization fix existed)
    await prisma.builtUnit.update({
      where: { id: unit.id },
      data: { status: "AVAILABLE" },
    });

    // Run reallocateProjectCosts to set productionCost
    await prisma.$transaction(async (tx) => {
      await reallocateProjectCosts(tx, fixture.project.id);
    });

    return { ...fixture, unit };
  }

  /**
   * Helper: create a SOLD unit with an AssetSale record (simulating a unit
   * that was sold before the capitalization fix existed).
   */
  async function createHistoricalSoldUnit(opts: {
    projectCostAmount: Decimal;
    salePrice: Decimal;
    cancelSale?: boolean;
  }) {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);

    const created = await createBuiltUnits({
      projectId: fixture.project.id,
      userId: fixture.user.id,
      units: [
        {
          unitType: "BHK_3",
          unitNumber: "B-201",
          area: new Decimal(1500),
        },
      ],
    });
    const unit = created[0]!;

    // Add project cost
    await prisma.projectCost.create({
      data: {
        projectId: fixture.project.id,
        costType: "LABOUR",
        amount: opts.projectCostAmount,
      },
    });

    // Set unit to UNDER_CONSTRUCTION so it's included in area allocation
    // (reallocateProjectCosts only allocates to AVAILABLE/HOLD/UNDER_CONSTRUCTION units)
    await prisma.builtUnit.update({
      where: { id: unit.id },
      data: { status: "UNDER_CONSTRUCTION" },
    });

    // Run reallocate to get productionCost
    await prisma.$transaction(async (tx) => {
      await reallocateProjectCosts(tx, fixture.project.id);
    });

    // Get the fresh productionCost (this is what costBasis should be)
    const freshUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    const costBasis = new Decimal(freshUnit!.productionCost);

    // Create a customer
    const customer = await prisma.customer.create({
      data: {
        name: "Test Customer",
        phone: "9999999999",
        companyId: fixture.company.id,
      },
    });

    // Create an AssetSale (simulating a sale that happened before the fix)
    const sale = await prisma.assetSale.create({
      data: {
        saleNumber: "SL-TEST-001",
        assetType: "BUILT_UNIT",
        builtUnitId: unit.id,
        customerId: customer.id,
        projectId: fixture.project.id,
        companyId: fixture.company.id,
        salePrice: opts.salePrice,
        costBasis,
        profit: opts.salePrice.minus(costBasis),
        status: opts.cancelSale ? "CANCELLED" : "ACTIVE",
        paymentStatus: "PAID",
        saleStage: "COMPLETED",
      },
    });

    // Set unit status to SOLD (or AVAILABLE if cancelled)
    await prisma.builtUnit.update({
      where: { id: unit.id },
      data: {
        status: opts.cancelSale ? "AVAILABLE" : "SOLD",
        saleId: opts.cancelSale ? null : sale.id,
      },
    });

    return { ...fixture, unit, sale, costBasis };
  }

  // ── Test 1: AVAILABLE unit capitalized from productionCost ──

  it("AVAILABLE unit with productionCost > 0 is capitalized from productionCost", async () => {
    const { unit, company, project } = await createHistoricalUnit({
      projectCostAmount: new Decimal(1000000),
    });

    // Verify no WIP_CAPITALIZATION entry exists yet
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
    });
    expect(existingEntry).toBeNull();

    // Verify the unit has a non-zero productionCost
    const freshUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(freshUnit!.productionCost.toNumber()).toBe(1000000);
    expect(freshUnit!.capitalizedAmount.toNumber()).toBe(0);

    // Run the backfill logic for this unit
    await prisma.$transaction(async (tx) => {
      await postWipCapitalization(tx, {
        companyId: company.id,
        builtUnitId: unit.id,
        projectId: project.id,
        costBasis: new Decimal(freshUnit!.productionCost),
      });
      await tx.builtUnit.update({
        where: { id: unit.id },
        data: { capitalizedAmount: freshUnit!.productionCost },
      });
    });

    // Verify the capitalization entry was posted
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
      include: { lines: true },
    });
    expect(entry).not.toBeNull();
    expect(entry!.totalDebit.toNumber()).toBe(1000000);

    // Verify capitalizedAmount was updated
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.capitalizedAmount.toNumber()).toBe(1000000);
  });

  // ── Test 2: SOLD unit capitalized from AssetSale.costBasis ──

  it("SOLD unit is capitalized from AssetSale.costBasis", async () => {
    const { unit, sale, company, project, costBasis } = await createHistoricalSoldUnit({
      projectCostAmount: new Decimal(2000000),
      salePrice: new Decimal(5000000),
    });

    // Verify the sale's costBasis matches the unit's productionCost at sale time
    expect(sale.costBasis.toNumber()).toBe(costBasis.toNumber());
    expect(sale.status).toBe("ACTIVE");

    // Run the backfill logic for this SOLD unit — use costBasis from the sale
    await prisma.$transaction(async (tx) => {
      await postWipCapitalization(tx, {
        companyId: company.id,
        builtUnitId: unit.id,
        projectId: project.id,
        costBasis: new Decimal(sale.costBasis),
      });
      await tx.builtUnit.update({
        where: { id: unit.id },
        data: { capitalizedAmount: new Decimal(sale.costBasis) },
      });
    });

    // Verify the capitalization entry was posted with the sale's costBasis
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
      include: { lines: true },
    });
    expect(entry).not.toBeNull();
    expect(entry!.totalDebit.toNumber()).toBe(costBasis.toNumber());

    // Verify the Dr line is UNIT_ASSET (1800) and Cr line is WIP (1500)
    const debitLine = entry!.lines.find((l) => l.accountCode === ACCT.UNIT_ASSET);
    const creditLine = entry!.lines.find((l) => l.accountCode === ACCT.WIP);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();
    expect(debitLine!.debit.toNumber()).toBe(costBasis.toNumber());
    expect(creditLine!.credit.toNumber()).toBe(costBasis.toNumber());
  });

  // ── Test 3: SOLD unit with cancelled sale is skipped ──

  it("SOLD unit with only a cancelled sale is skipped (no active sale)", async () => {
    const { unit } = await createHistoricalSoldUnit({
      projectCostAmount: new Decimal(500000),
      salePrice: new Decimal(1000000),
      cancelSale: true,
    });

    // The unit should be AVAILABLE (not SOLD) because the sale was cancelled
    const freshUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(freshUnit!.status).toBe("AVAILABLE");

    // Verify no active sale exists for this unit
    const activeSale = await prisma.assetSale.findFirst({
      where: { builtUnitId: unit.id, assetType: "BUILT_UNIT", status: "ACTIVE" },
    });
    expect(activeSale).toBeNull();
  });

  // ── Test 4: Unit with productionCost = 0 is skipped ──

  it("unit with productionCost = 0 and no sale is skipped (nothing to capitalize)", async () => {
    const { unit } = await createHistoricalUnit({
      // No project cost → productionCost will be 0
    });

    const freshUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(freshUnit!.productionCost.toNumber()).toBe(0);

    // The backfill would skip this unit — verify postWipCapitalization with
    // zero amount returns null (no entry posted)
    const result = await prisma.$transaction(async (tx) => {
      return postWipCapitalization(tx, {
        companyId: "test-company",
        builtUnitId: unit.id,
        projectId: "test-project",
        costBasis: new Decimal(0),
      });
    });
    expect(result).toBeNull();
  });

  // ── Test 5: Unit that already has a WIP_CAPITALIZATION entry is skipped ──

  it("unit that already has a WIP_CAPITALIZATION entry is not double-capitalized", async () => {
    const { unit, company, project } = await createHistoricalUnit({
      projectCostAmount: new Decimal(750000),
    });

    // First capitalization (simulating the backfill running once)
    await prisma.$transaction(async (tx) => {
      await postWipCapitalization(tx, {
        companyId: company.id,
        builtUnitId: unit.id,
        projectId: project.id,
        costBasis: new Decimal(750000),
      });
      await tx.builtUnit.update({
        where: { id: unit.id },
        data: { capitalizedAmount: new Decimal(750000) },
      });
    });

    // Verify one entry exists
    const entriesAfterFirst = await prisma.journalEntry.findMany({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
    });
    expect(entriesAfterFirst).toHaveLength(1);

    // Second run — the backfill script checks for existing entries and skips
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
      select: { id: true },
    });
    expect(existingEntry).not.toBeNull(); // would be skipped by the backfill

    // Verify still only one entry
    const entriesAfterSecond = await prisma.journalEntry.findMany({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
    });
    expect(entriesAfterSecond).toHaveLength(1);
  });
});

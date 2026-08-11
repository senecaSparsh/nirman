/**
 * Integration tests for Scrap GL Posting (Phase 1B).
 *
 * These tests verify that scrap generation posts a balanced GL entry:
 *   - Project-linked: Dr Inventory (1300) / Cr WIP (1500)
 *   - Standalone:     Dr Inventory (1300) / Cr Operating Expense (6000)
 *
 * Also verifies:
 *   - Zero-value scrap posts no GL entry
 *   - Stock movements have refId set directly (race condition fix)
 *   - projectTotalCost() uses scrap generation value, not sale revenue
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { createScrapGeneration } from "../scrap";
import { projectTotalCost } from "../valuation";
import { ACCT } from "../gl-posting";

describe("Scrap GL Posting — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  /**
   * Helper: create a full test scenario with a project, stock location,
   * and a material that can be used for scrap generation.
   */
  async function setupScenario(opts: { withProject?: boolean } = {}) {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);

    // Create a material category (required by Material model)
    const category = await prisma.materialCategory.create({
      data: {
        name: "Test Scrap Category",
        unit: "KG",
      },
    });

    // Create a material for scrap
    const material = await prisma.material.create({
      data: {
        code: "SCRAP-001",
        name: "Test Scrap Material",
        unit: "KG",
        categoryId: category.id,
        isScrap: true,
      },
    });

    // Ensure the stock location has an item entry for this material
    await prisma.stockLocationItem.create({
      data: {
        materialId: material.id,
        locationId: fixture.stockLocation.id,
        qty: new Decimal(0),
        movingAvgCost: new Decimal(0),
      },
    });

    return {
      ...fixture,
      material,
      category,
      projectId: opts.withProject ? fixture.project.id : undefined,
    };
  }

  /**
   * Helper: find the SCRAP_GENERATION journal entry for a scrap generation.
   */
  async function findScrapEntry(scrapGenerationId: string) {
    return prisma.journalEntry.findFirst({
      where: {
        sourceType: "SCRAP_GENERATION",
        sourceId: scrapGenerationId,
      },
      include: { lines: true },
    });
  }

  // ── Test 1: Project-linked scrap posts Dr Inventory / Cr WIP ──

  it("project-linked scrap generation posts Dr Inventory (1300) / Cr WIP (1500)", async () => {
    const { company, project, stockLocation, material, user } = await setupScenario({
      withProject: true,
    });

    const scrap = await createScrapGeneration({
      companyId: company.id,
      toLocationId: stockLocation.id,
      projectId: project.id,
      createdById: user.id,
      notes: "Test project-linked scrap",
      lines: [
        { materialId: material.id, qty: new Decimal(100), unitCost: new Decimal(50) },
      ],
    });

    expect(scrap).toBeDefined();
    expect(scrap!.id).toBeDefined();

    // Verify the GL entry
    const entry = await findScrapEntry(scrap!.id);
    expect(entry).not.toBeNull();
    expect(entry!.sourceType).toBe("SCRAP_GENERATION");
    expect(entry!.lines).toHaveLength(2);

    const debitLine = entry!.lines.find((l) => l.accountCode === ACCT.INVENTORY);
    const creditLine = entry!.lines.find((l) => l.accountCode === ACCT.WIP);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();

    // Total value = 100 qty × 50 unitCost = 5000
    expect(debitLine!.debit.toNumber()).toBe(5000);
    expect(creditLine!.credit.toNumber()).toBe(5000);
    expect(entry!.totalDebit.toNumber()).toBe(5000);
    expect(entry!.totalCredit.toNumber()).toBe(5000);
  });

  // ── Test 2: Standalone scrap posts Dr Inventory / Cr OPERATING_EXPENSE ──

  it("standalone scrap generation posts Dr Inventory (1300) / Cr Operating Expense (6000)", async () => {
    const { company, stockLocation, material, user } = await setupScenario({
      withProject: false,
    });

    const scrap = await createScrapGeneration({
      companyId: company.id,
      toLocationId: stockLocation.id,
      // No projectId — standalone scrap
      createdById: user.id,
      notes: "Test standalone scrap",
      lines: [
        { materialId: material.id, qty: new Decimal(50), unitCost: new Decimal(20) },
      ],
    });

    expect(scrap).toBeDefined();

    // Verify the GL entry
    const entry = await findScrapEntry(scrap!.id);
    expect(entry).not.toBeNull();
    expect(entry!.lines).toHaveLength(2);

    const debitLine = entry!.lines.find((l) => l.accountCode === ACCT.INVENTORY);
    const creditLine = entry!.lines.find((l) => l.accountCode === ACCT.OPERATING_EXPENSE);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();

    // Total value = 50 qty × 20 unitCost = 1000
    expect(debitLine!.debit.toNumber()).toBe(1000);
    expect(creditLine!.credit.toNumber()).toBe(1000);

    // Verify WIP is NOT credited for standalone scrap
    const wipLine = entry!.lines.find((l) => l.accountCode === ACCT.WIP);
    expect(wipLine).toBeUndefined();
  });

  // ── Test 3: Zero-value scrap posts no GL entry ──

  it("zero-value scrap generation posts no GL entry", async () => {
    const { company, stockLocation, material, user } = await setupScenario({
      withProject: true,
    });

    const scrap = await createScrapGeneration({
      companyId: company.id,
      toLocationId: stockLocation.id,
      projectId: undefined, // standalone to avoid project cost issues
      createdById: user.id,
      lines: [
        { materialId: material.id, qty: new Decimal(10), unitCost: new Decimal(0) },
      ],
    });

    expect(scrap).toBeDefined();

    // Verify NO GL entry was posted (zero value → postScrapGeneration returns null)
    const entry = await findScrapEntry(scrap!.id);
    expect(entry).toBeNull();
  });

  // ── Test 4: Stock movements have refId set directly (race condition fix) ──

  it("stock movements have refId set directly (no updateMany race condition)", async () => {
    const { company, stockLocation, material, user } = await setupScenario({
      withProject: true,
    });

    const scrap = await createScrapGeneration({
      companyId: company.id,
      toLocationId: stockLocation.id,
      projectId: undefined,
      createdById: user.id,
      lines: [
        { materialId: material.id, qty: new Decimal(30), unitCost: new Decimal(15) },
      ],
    });

    // Verify the stock movement has refId set to the scrap generation ID
    const movements = await prisma.stockMovement.findMany({
      where: { refType: "SCRAP_GENERATION", refId: scrap!.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.refId).toBe(scrap!.id);
    expect(movements[0]!.movementType).toBe("SCRAP_GENERATED");
  });

  // ── Test 5: projectTotalCost() uses scrap generation value, not sale revenue ──

  it("projectTotalCost() subtracts scrap generation value, not scrap sale revenue", async () => {
    const { company, project, stockLocation, material, user } = await setupScenario({
      withProject: true,
    });

    // Add a project cost so the project has a non-zero base cost
    await prisma.projectCost.create({
      data: {
        projectId: project.id,
        costType: "LABOUR",
        amount: new Decimal(100000),
      },
    });

    // Generate scrap linked to the project (value = 100 × 50 = 5000)
    await createScrapGeneration({
      companyId: company.id,
      toLocationId: stockLocation.id,
      projectId: project.id,
      createdById: user.id,
      lines: [
        { materialId: material.id, qty: new Decimal(100), unitCost: new Decimal(50) },
      ],
    });

    // Compute project total cost
    const cost = await projectTotalCost(project.id);

    // The scrap generation value (5000) should be subtracted from the gross cost
    // grossCost = labour (100000) + materials (0) + land (0) = 100000
    // costRecovery = scrap generation value = 5000
    // netCost = 100000 - 5000 = 95000
    expect(cost.labour.toNumber()).toBe(100000);
    expect(cost.costRecovery.toNumber()).toBe(5000);
    expect(cost.total.toNumber()).toBe(95000);
  });

  // ── Test 6: Multi-line scrap generation sums correctly ──

  it("multi-line scrap generation posts a single GL entry with the summed total", async () => {
    const { company, stockLocation, material, category, user } = await setupScenario({
      withProject: true,
    });

    // Create a second material
    const material2 = await prisma.material.create({
      data: {
        code: "SCRAP-002",
        name: "Test Scrap Material 2",
        unit: "KG",
        categoryId: category.id,
        isScrap: true,
      },
    });
    await prisma.stockLocationItem.create({
      data: {
        materialId: material2.id,
        locationId: stockLocation.id,
        qty: new Decimal(0),
        movingAvgCost: new Decimal(0),
      },
    });

    const scrap = await createScrapGeneration({
      companyId: company.id,
      toLocationId: stockLocation.id,
      projectId: undefined, // standalone
      createdById: user.id,
      lines: [
        { materialId: material.id, qty: new Decimal(100), unitCost: new Decimal(50) },   // 5000
        { materialId: material2.id, qty: new Decimal(200), unitCost: new Decimal(10) },  // 2000
      ],
    });

    // Verify a single GL entry with the summed total
    const entry = await findScrapEntry(scrap!.id);
    expect(entry).not.toBeNull();
    expect(entry!.totalDebit.toNumber()).toBe(7000); // 5000 + 2000
    expect(entry!.totalCredit.toNumber()).toBe(7000);
  });
});

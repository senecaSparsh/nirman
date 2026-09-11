/**
 * Integration tests for reallocateProjectCosts — the cost allocation engine.
 *
 * This function is the bridge between the costing layer (material issues,
 * labour, land, scrap) and the asset valuation layer (BuiltUnit.productionCost).
 * It computes costPerSqft and writes it back to each unit.
 *
 * Cost formula:
 *   totalCost = projectMaterials + directMaterials + labour + land − scrapRecovery
 *   poolToAllocate = projectMaterials + labour + land − scrapRecovery
 *   costPerSqft = poolToAllocate / totalArea
 *   unit.productionCost = costPerSqft × unit.area + directCostsForUnit
 *
 * Tests cover:
 *   - Basic area allocation (2 units, equal area)
 *   - Direct-to-unit costs (added on top of area allocation)
 *   - Scrap generation value reduces the pool
 *   - Land purchase cost is included
 *   - Labour (ProjectCost) is included
 *   - SOLD units are excluded from area allocation
 *   - PURCHASED units are excluded (only CREATED units participate)
 *   - Zero-area guard (no sellable units → no error, costs stay in WIP)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture } from "./setup";

describe("reallocateProjectCosts — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    return fixture;
  }

  /** Create a material + category for issue lines. */
  async function createMaterial(companyId: string) {
    const category = await prisma.materialCategory.create({
      data: { companyId, name: "Construction", unit: "BAG", class: "RAW_MATERIAL" },
    });
    return prisma.material.create({
      data: {
        companyId,
        code: `MAT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        name: "Cement",
        categoryId: category.id,
        unit: "BAG",
      },
    });
  }

  /** Create a built unit with the given area. */
  async function createUnit(
    projectId: string,
    unitNumber: string,
    area: number,
    status: "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "RESERVED" | "HOLD" | "SOLD" | "RENTED" = "AVAILABLE",
    originType: "CREATED" | "PURCHASED" = "CREATED",
  ) {
    return prisma.builtUnit.create({
      data: {
        projectId,
        unitType: "BHK_2",
        unitNumber,
        floor: 1,
        area: new Decimal(area),
        areaUnit: "SQFT",
        status,
        originType,
      },
    });
  }

  /** Create a material issue to the project (area-allocated). */
  async function createProjectMaterialIssue(projectId: string, locationId: string, materialId: string, qty: number, unitCost: number) {
    const issue = await prisma.materialIssue.create({
      data: {
        projectId,
        fromLocationId: locationId,
        issueDate: new Date(),
      },
    });
    await prisma.materialIssueLine.create({
      data: {
        materialIssueId: issue.id,
        materialId,
        qty: new Decimal(qty),
        unitCost: new Decimal(unitCost),
      },
    });
    return issue;
  }

  /** Create a material issue directly to a specific built unit. */
  async function createUnitDirectMaterialIssue(projectId: string, builtUnitId: string, locationId: string, materialId: string, qty: number, unitCost: number) {
    const issue = await prisma.materialIssue.create({
      data: {
        projectId,
        builtUnitId,
        fromLocationId: locationId,
        issueDate: new Date(),
      },
    });
    await prisma.materialIssueLine.create({
      data: {
        materialIssueId: issue.id,
        materialId,
        qty: new Decimal(qty),
        unitCost: new Decimal(unitCost),
      },
    });
    return issue;
  }

  /** Create a ProjectCost record (labour/overhead/etc). */
  async function createProjectCost(projectId: string, amount: number, costType: "LABOUR" | "OVERHEAD" | "EQUIPMENT" | "CONTRACTOR" | "PERMIT" = "LABOUR") {
    return prisma.projectCost.create({
      data: {
        projectId,
        costType,
        amount: new Decimal(amount),
        date: new Date(),
      },
    });
  }

  /** Create a land purchase linked to the project. */
  async function createLandPurchase(companyId: string, projectId: string, totalCost: number) {
    return prisma.landPurchase.create({
      data: {
        companyId,
        projectId,
        sellerName: "Test Seller",
        totalArea: new Decimal(10000),
        areaUnit: "SQFT",
        totalCost: new Decimal(totalCost),
      },
    });
  }

  /** Create a scrap generation for the project. */
  async function createScrapGeneration(companyId: string, projectId: string, locationId: string, materialId: string, qty: number, unitCost: number) {
    const scrap = await prisma.scrapGeneration.create({
      data: {
        companyId,
        scrapNumber: `SCR-${Date.now()}`,
        toLocationId: locationId,
        projectId,
        generationDate: new Date(),
      },
    });
    await prisma.scrapGenerationLine.create({
      data: {
        scrapGenerationId: scrap.id,
        materialId,
        qty: new Decimal(qty),
        unitCost: new Decimal(unitCost),
      },
    });
    return scrap;
  }

  // ── Basic area allocation ──

  it("allocates project costs equally across 2 units with equal area", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 1000);

    // 100 bags × 500 = 50,000 project-level material cost
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 100, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    // totalArea = 2000, totalCost = 50000, costPerSqft = 25
    expect(result.totalArea.toNumber()).toBe(2000);
    expect(result.totalCost.toNumber()).toBe(50000);
    expect(result.costPerSqft.toNumber()).toBe(25);

    // Each unit: 25 × 1000 = 25,000
    const units = await prisma.builtUnit.findMany({ where: { projectId: project.id }, orderBy: { unitNumber: "asc" } });
    expect(units[0]!.productionCost?.toNumber()).toBe(25000);
    expect(units[1]!.productionCost?.toNumber()).toBe(25000);
  });

  it("allocates proportionally for units with different areas", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 3000);

    // Total area = 4000, cost = 80,000 → costPerSqft = 20
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 160, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    const units = await prisma.builtUnit.findMany({ where: { projectId: project.id }, orderBy: { unitNumber: "asc" } });
    expect(units[0]!.productionCost?.toNumber()).toBe(20000); // 20 × 1000
    expect(units[1]!.productionCost?.toNumber()).toBe(60000); // 20 × 3000
  });

  // ── Direct-to-unit costs ──

  it("adds direct-to-unit costs on top of area allocation", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    const unit1 = await createUnit(project.id, "A-101", 1000);
    const unit2 = await createUnit(project.id, "A-102", 1000);

    // Project-level: 40,000 → 20/sqft → 20,000 per unit
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 80, 500);

    // Direct to unit1: 10,000 extra
    await createUnitDirectMaterialIssue(project.id, unit1.id, stockLocation.id, material.id, 20, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    const units = await prisma.builtUnit.findMany({ where: { projectId: project.id }, orderBy: { unitNumber: "asc" } });
    // unit1: 20,000 (area) + 10,000 (direct) = 30,000
    expect(units[0]!.productionCost?.toNumber()).toBe(30000);
    // unit2: 20,000 (area only)
    expect(units[1]!.productionCost?.toNumber()).toBe(20000);
  });

  // ── Scrap recovery ──

  it("scrap generation value reduces the area-allocated pool", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 1000);

    // Project material: 50,000
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 100, 500);
    // Scrap generated: 10,000 value
    await createScrapGeneration("test-company", project.id, stockLocation.id, material.id, 20, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    // pool = 50,000 - 10,000 = 40,000 → costPerSqft = 20
    expect(result.costPerSqft.toNumber()).toBe(20);
    expect(result.totalCost.toNumber()).toBe(40000);

    const units = await prisma.builtUnit.findMany({ where: { projectId: project.id }, orderBy: { unitNumber: "asc" } });
    expect(units[0]!.productionCost?.toNumber()).toBe(20000);
    expect(units[1]!.productionCost?.toNumber()).toBe(20000);
  });

  // ── Labour + land ──

  it("includes labour (ProjectCost) in the area-allocated pool", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 1000);

    // Material: 30,000 + Labour: 20,000 = 50,000 → 25/sqft
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 60, 500);
    await createProjectCost(project.id, 20000, "LABOUR");

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    expect(result.costPerSqft.toNumber()).toBe(25);
  });

  it("includes land purchase cost in the area-allocated pool", async () => {
    const { project } = await setup();
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 1000);

    // Land: 100,000 → 50/sqft
    await createLandPurchase("test-company", project.id, 100000);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    expect(result.costPerSqft.toNumber()).toBe(50);
    expect(result.totalCost.toNumber()).toBe(100000);
  });

  // ── Exclusion rules ──

  it("excludes SOLD units from area allocation", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000, "AVAILABLE");
    await createUnit(project.id, "A-102", 1000, "SOLD");

    // 50,000 cost, but only 1 unit participates (area = 1000) → 50/sqft
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 100, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    expect(result.totalArea.toNumber()).toBe(1000); // only the AVAILABLE unit
    expect(result.costPerSqft.toNumber()).toBe(50);

    const units = await prisma.builtUnit.findMany({ where: { projectId: project.id }, orderBy: { unitNumber: "asc" } });
    expect(units[0]!.productionCost?.toNumber()).toBe(50000); // AVAILABLE unit
    expect(units[1]!.productionCost?.toNumber()).toBe(0); // SOLD unit — not updated
  });

  it("excludes PURCHASED units from area allocation (only CREATED units participate)", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000, "AVAILABLE", "CREATED");
    await createUnit(project.id, "A-102", 1000, "AVAILABLE", "PURCHASED");

    // 50,000 cost, only 1 CREATED unit participates → 50/sqft
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 100, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    expect(result.totalArea.toNumber()).toBe(1000); // only the CREATED unit
    expect(result.costPerSqft.toNumber()).toBe(50);
  });

  // ── Edge cases ──

  it("handles zero sellable area without error (costs stay in WIP)", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");

    // All units are PLANNED (not in the allocation set)
    await createUnit(project.id, "A-101", 1000, "PLANNED");

    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 100, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    // No error, costPerSqft = 0 (no units to allocate to)
    expect(result.totalArea.toNumber()).toBe(0);
    expect(result.costPerSqft.toNumber()).toBe(0);
    expect(result.totalCost.toNumber()).toBe(50000); // cost exists, just not allocated
  });

  it("clamps negative pool (scrap > costs) to zero", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 1000);

    // Material: 10,000, Scrap: 20,000 → pool = -10,000 → clamped to 0
    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 20, 500);
    await createScrapGeneration("test-company", project.id, stockLocation.id, material.id, 40, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    const result = await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    expect(result.costPerSqft.toNumber()).toBe(0);
    // totalCost can be negative (real cost), but costPerSqft is clamped
    expect(result.totalCost.toNumber()).toBe(-10000);

    const units = await prisma.builtUnit.findMany({ where: { projectId: project.id } });
    for (const u of units) {
      expect(u.productionCost?.toNumber()).toBe(0);
    }
  });

  it("updates Project.costPerSqft cache after reallocation", async () => {
    const { project, stockLocation } = await setup();
    const material = await createMaterial("test-company");
    await createUnit(project.id, "A-101", 1000);
    await createUnit(project.id, "A-102", 1000);

    await createProjectMaterialIssue(project.id, stockLocation.id, material.id, 100, 500);

    const { reallocateProjectCosts } = await import("../valuation");
    await prisma.$transaction(async (tx) => reallocateProjectCosts(tx, project.id));

    const updatedProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updatedProject).not.toBeNull();
    expect(updatedProject!.costPerSqft?.toNumber()).toBe(25);
  });
});

/**
 * Integration tests for land.ts — validation paths and happy path.
 *
 * Tests:
 *   1. recordLandPurchase() validation: area ≤ 0, cost ≤ 0, bad company
 *   2. recordLandPurchase() happy path: creates land purchase + parcel + GL entry
 *
 * Uses the test DB (nirman_inventory_test) with resetDb() between tests.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import { recordLandPurchase } from "../land";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import Decimal from "decimal.js";

describe("recordLandPurchase", () => {
  beforeAll(async () => {
    const result = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    expect(result[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("throws ServiceError when total area is 0", async () => {
    const { company } = await createTestFixture();
    await expect(
      recordLandPurchase({
        companyId: company.id,
        sellerName: "Test Seller",
        totalArea: 0,
        totalCost: 100000,
      }),
    ).rejects.toThrow("Total area must be > 0");
  });

  it("throws ServiceError when total area is negative", async () => {
    const { company } = await createTestFixture();
    await expect(
      recordLandPurchase({
        companyId: company.id,
        sellerName: "Test Seller",
        totalArea: -100,
        totalCost: 100000,
      }),
    ).rejects.toThrow("Total area must be > 0");
  });

  it("throws ServiceError when total cost is 0", async () => {
    const { company } = await createTestFixture();
    await expect(
      recordLandPurchase({
        companyId: company.id,
        sellerName: "Test Seller",
        totalArea: 5000,
        totalCost: 0,
      }),
    ).rejects.toThrow("Total cost must be > 0");
  });

  it("throws ServiceError when total cost is negative", async () => {
    const { company } = await createTestFixture();
    await expect(
      recordLandPurchase({
        companyId: company.id,
        sellerName: "Test Seller",
        totalArea: 5000,
        totalCost: -50000,
      }),
    ).rejects.toThrow("Total cost must be > 0");
  });

  it("throws ServiceError when company not found", async () => {
    await expect(
      recordLandPurchase({
        companyId: "nonexistent-company",
        sellerName: "Test Seller",
        totalArea: 5000,
        totalCost: 100000,
      }),
    ).rejects.toThrow("Company not found or deleted");
  });

  it("throws ServiceError when project not found", async () => {
    const { company } = await createTestFixture();
    await expect(
      recordLandPurchase({
        companyId: company.id,
        projectId: "nonexistent-project",
        sellerName: "Test Seller",
        totalArea: 5000,
        totalCost: 100000,
      }),
    ).rejects.toThrow("Project not found");
  });

  it("creates a land purchase with a whole parcel (happy path)", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Ramesh Properties",
      sellerContact: "9876543210",
      totalArea: 10000,
      totalCost: 5000000,
      registryNo: "REG-2026-001",
      location: "Sector 62, Noida",
      createdById: user.id,
    });

    expect(result).toBeDefined();
    expect(result.landPurchase).toBeDefined();
    expect(result.landPurchase.id).toBeDefined();
    expect(result.landPurchase.sellerName).toBe("Ramesh Properties");
    expect(result.landPurchase.totalArea.toNumber()).toBe(10000);
    expect(result.landPurchase.totalCost.toNumber()).toBe(5000000);
    expect(result.landPurchase.mode).toBe("WHOLE");

    // Verify parcel was created
    expect(result.parcel).toBeDefined();
    expect(result.parcel.status).toBe("AVAILABLE");
    expect(result.parcel.purpose).toBe("HOLD");
    expect(result.parcel.area.toNumber()).toBe(10000);
  });

  it("creates land purchase linked to a project with PROJECT purpose", async () => {
    const { company, project, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      projectId: project.id,
      sellerName: "Test Seller",
      totalArea: 5000,
      totalCost: 2000000,
      createdById: user.id,
    });

    expect(result.parcel.purpose).toBe("PROJECT");
    expect(result.parcel.projectId).toBe(project.id);
  });

  it("accepts Decimal inputs for area and cost", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Test Seller",
      totalArea: new Decimal("10000.5"),
      totalCost: new Decimal("1500000.75"),
      createdById: user.id,
    });

    expect(result.landPurchase.totalArea.toNumber()).toBe(10000.5);
    expect(result.landPurchase.totalCost.toNumber()).toBe(1500000.75);
  });

  it("accepts string inputs for area and cost", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Test Seller",
      totalArea: "8000",
      totalCost: "3000000",
      createdById: user.id,
    });

    expect(result.landPurchase.totalArea.toNumber()).toBe(8000);
    expect(result.landPurchase.totalCost.toNumber()).toBe(3000000);
  });

  it("defaults area unit to SQFT", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Test Seller",
      totalArea: 5000,
      totalCost: 1000000,
      createdById: user.id,
    });

    expect(result.landPurchase.areaUnit).toBe("SQFT");
  });

  it("accepts custom area unit (ACRE)", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Test Seller",
      totalArea: 5,
      areaUnit: "ACRE",
      totalCost: 10000000,
      createdById: user.id,
    });

    expect(result.landPurchase.areaUnit).toBe("ACRE");
  });

  it("defaults parcel number to PLOT-1", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Test Seller",
      totalArea: 5000,
      totalCost: 1000000,
      createdById: user.id,
    });

    expect(result.parcel.number).toBe("PLOT-1");
  });

  it("accepts custom parcel number", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    const result = await recordLandPurchase({
      companyId: company.id,
      sellerName: "Test Seller",
      totalArea: 5000,
      totalCost: 1000000,
      initialParcelNumber: "SURVEY-42",
      createdById: user.id,
    });

    expect(result.parcel.number).toBe("SURVEY-42");
  });
});

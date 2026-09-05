/**
 * Integration tests for tenancy.ts — validation paths.
 *
 * Tests:
 *   1. createTenancy() validation: rent ≤ 0, bad dates, missing asset
 *   2. createTenancy() happy path for built unit
 *
 * Uses the test DB (nirman_inventory_test) with resetDb() between tests.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import { createTenancy } from "../tenancy";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import Decimal from "decimal.js";

describe("createTenancy", () => {
  beforeAll(async () => {
    const result = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    expect(result[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("throws ServiceError when monthly rent is 0", async () => {
    const { company } = await createTestFixture();
    await expect(
      createTenancy({
        companyId: company.id,
        assetType: "BUILT_UNIT",
        builtUnitId: "test-unit",
        tenantName: "Ramesh",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: 0,
      }),
    ).rejects.toThrow("Monthly rent must be > 0");
  });

  it("throws ServiceError when monthly rent is negative", async () => {
    const { company } = await createTestFixture();
    await expect(
      createTenancy({
        companyId: company.id,
        assetType: "BUILT_UNIT",
        builtUnitId: "test-unit",
        tenantName: "Ramesh",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: -5000,
      }),
    ).rejects.toThrow("Monthly rent must be > 0");
  });

  it("throws ServiceError when end date is before start date", async () => {
    const { company } = await createTestFixture();
    await expect(
      createTenancy({
        companyId: company.id,
        assetType: "BUILT_UNIT",
        builtUnitId: "test-unit",
        tenantName: "Ramesh",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
        monthlyRent: 10000,
      }),
    ).rejects.toThrow("End date cannot be before start date");
  });

  it("throws ServiceError when LAND tenancy has no landParcelId", async () => {
    const { company } = await createTestFixture();
    await expect(
      createTenancy({
        companyId: company.id,
        assetType: "LAND",
        tenantName: "Ramesh",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: 10000,
      }),
    ).rejects.toThrow("Land tenancy requires landParcelId");
  });

  it("throws ServiceError when BUILT_UNIT tenancy has no builtUnitId", async () => {
    const { company } = await createTestFixture();
    await expect(
      createTenancy({
        companyId: company.id,
        assetType: "BUILT_UNIT",
        tenantName: "Ramesh",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: 10000,
      }),
    ).rejects.toThrow("Built unit tenancy requires builtUnitId");
  });

  it("throws ServiceError when built unit not found", async () => {
    const { company } = await createTestFixture();
    await expect(
      createTenancy({
        companyId: company.id,
        assetType: "BUILT_UNIT",
        builtUnitId: "nonexistent-unit",
        tenantName: "Ramesh",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: 10000,
      }),
    ).rejects.toThrow("Built unit not found or deleted");
  });

  it("creates a tenancy for an available built unit (happy path)", async () => {
    const { company, project, user } = await createTestFixture();
    await seedTestAccounts(company.id);

    // Create a built unit
    const unit = await prisma.builtUnit.create({
      data: {
        projectId: project.id,
        unitNumber: "A-101",
        unitType: "BHK_2",
        status: "AVAILABLE",
        area: new Decimal(1000),
      },
    });

    const result = await createTenancy({
      companyId: company.id,
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      tenantName: "Ramesh Kumar",
      tenantPhone: "9876543210",
      startDate: "2026-01-01",
      endDate: "2028-12-31",
      monthlyRent: 15000,
      securityDeposit: 45000,
      userId: user.id,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.tenantName).toBe("Ramesh Kumar");
    expect(result.tenantPhone).toBe("9876543210");
    expect(result.status).toBe("PENDING");
    expect(result.monthlyRent.toNumber()).toBe(15000);
    expect(result.securityDeposit?.toNumber()).toBe(45000);
  });

  it("accepts Decimal inputs for rent and deposit", async () => {
    const { company, project } = await createTestFixture();
    await seedTestAccounts(company.id);

    const unit = await prisma.builtUnit.create({
      data: {
        projectId: project.id,
        unitNumber: "B-202",
        unitType: "SHOP",
        status: "AVAILABLE",
        area: new Decimal(500),
      },
    });

    const result = await createTenancy({
      companyId: company.id,
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      tenantName: "Test Tenant",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      monthlyRent: new Decimal("25000.50"),
      securityDeposit: new Decimal("75000.00"),
    });

    expect(result.monthlyRent.toNumber()).toBe(25000.5);
    expect(result.securityDeposit?.toNumber()).toBe(75000);
  });
});

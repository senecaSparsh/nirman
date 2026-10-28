import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@nirman/db";
import { createTenancy, activateTenancy } from "../tenancy";
import { resetDb, createTestFixture } from "./setup";

vi.mock("../notifications", () => ({
  emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("rentFreeDays billing anchor", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("anchors dues on the billing-start day (start + rentFreeDays), not the lease-start day", async () => {
    const { company, project } = await createTestFixture();
    const unit = await prisma.builtUnit.create({
      data: {
        id: "u1", projectId: project.id,
        unitNumber: "SH-1", unitType: "SHOP", area: 500, status: "AVAILABLE",
      },
    });
    const t = await createTenancy({
      companyId: company.id,
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      tenantName: "Shop Tenant",
      startDate: new Date("2026-01-10T00:00:00Z"),
      endDate: new Date("2027-12-31T00:00:00Z"),
      monthlyRent: 50000,
      securityDeposit: 0,
      rentFreeDays: 30,
    });
    // billingStart = 2026-01-10 + 30d = 2026-02-09 → dues on the 9th, never before.
    const billingStart = new Date("2026-02-09T00:00:00Z");

    await activateTenancy(t.id, company.id);

    const dues = await prisma.rentalPayment.findMany({
      where: { tenancyId: t.id },
      orderBy: { dueDate: "asc" },
    });
    expect(dues.length).toBeGreaterThan(0);
    for (const d of dues) {
      expect(d.dueDate.getTime()).toBeGreaterThanOrEqual(billingStart.getTime());
      expect(d.dueDate.getUTCDate()).toBe(9);
    }
  });

  it("a 15-day fit-out shifts the due day to the 20th", async () => {
    const { company, project } = await createTestFixture();
    const unit = await prisma.builtUnit.create({
      data: {
        id: "u2", projectId: project.id,
        unitNumber: "SH-2", unitType: "SHOP", area: 400, status: "AVAILABLE",
      },
    });
    const t = await createTenancy({
      companyId: company.id,
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      tenantName: "No Free Period",
      startDate: new Date("2026-03-05T00:00:00Z"),
      endDate: new Date("2027-12-31T00:00:00Z"),
      monthlyRent: 20000,
      securityDeposit: 0,
      rentFreeDays: 15,
    });
    // billingStart = 2026-03-05 + 15d = 2026-03-20 → dues on the 20th.
    const billingStart = new Date("2026-03-20T00:00:00Z");

    await activateTenancy(t.id, company.id);

    const dues = await prisma.rentalPayment.findMany({
      where: { tenancyId: t.id },
      orderBy: { dueDate: "asc" },
    });
    expect(dues.length).toBeGreaterThan(0);
    for (const d of dues) {
      expect(d.dueDate.getTime()).toBeGreaterThanOrEqual(billingStart.getTime());
      expect(d.dueDate.getUTCDate()).toBe(20);
    }
  });
});

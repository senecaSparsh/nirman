import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { createMaterialIssueRequest, cancelMaterialIssue } from "../issue";
import { createSupplierPayment } from "../supplier-payment";
import { createSupplierReturn, cancelSupplierReturn } from "../supplier-return";

/**
 * Guard-regression tests — the mutation-coverage gaps the Layer-7 probe found.
 *
 * Each test pins down one guard added during the HTTP-probe sweep: if the
 * guard is silently reverted (mutated `===`→`!==`, removed `if`), THIS test
 * dies — which is what Stryker measures but on files too heavy to mutate-scan
 * economically against a DB-backed suite.
 *
 * Covers:
 *   1. PENDING issue cancel must not restore stock (phantom-stock guard)
 *   2. Supplier payment duplicate-reference dedup
 *   3. Supplier payment double-submit window dedup
 *   4. Supplier-return re-cancel refusal
 */
describe("guard regressions", () => {
  let fx: Awaited<ReturnType<typeof createTestFixture>>;

  beforeAll(async () => {
    const db = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
    expect(db[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
    fx = await createTestFixture();
    await seedTestAccounts(fx.company.id);
  });

  async function seedMaterial(qty = 100) {
    const cat = await prisma.materialCategory.create({
      data: { companyId: fx.company.id, name: "Guard Cat", unit: "NOS" },
    });
    const material = await prisma.material.create({
      data: { companyId: fx.company.id, code: "GRD-1", name: "Guard Mat", categoryId: cat.id, unit: "NOS", currentCost: new Decimal(10) },
    });
    await prisma.stockLocationItem.create({
      data: { locationId: fx.stockLocation.id, materialId: material.id, qty: new Decimal(qty), movingAvgCost: new Decimal(10) },
    });
    return material;
  }

  it("PENDING issue cancel mints no phantom stock", async () => {
    const material = await seedMaterial(100);
    const issue = await createMaterialIssueRequest({
      projectId: fx.project.id,
      fromLocationId: fx.stockLocation.id,
      companyId: fx.company.id,
      issuedById: fx.user.id,
      notes: "guard-reg",
      lines: [{ materialId: material.id, qty: 5 }],
    });
    expect(issue.materialIssue.status).toBe("PENDING");

    const before = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: material.id } },
    });
    await cancelMaterialIssue(issue.materialIssue.id, fx.user.id);
    const after = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: material.id } },
    });
    const moves = await prisma.stockMovement.count({ where: { materialId: material.id } });
    expect(Number(after?.qty)).toBe(Number(before?.qty));
    expect(moves).toBe(0);
  });

  it("supplier payment duplicate referenceNo is refused", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 1000,
      paymentMode: "UPI", paymentDate: new Date(), referenceNo: "UTR-GUARD-1",
    };
    await createSupplierPayment({ ...base, userId: fx.user.id });
    await expect(
      createSupplierPayment({ ...base, userId: fx.user.id }),
    ).rejects.toThrow(/already recorded/i);
  });

  it("identical supplier payment inside the window is refused (no referenceNo)", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 2", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 4321,
      paymentMode: "CASH", paymentDate: new Date(),
    };
    await createSupplierPayment({ ...base, userId: fx.user.id });
    await expect(
      createSupplierPayment({ ...base, userId: fx.user.id }),
    ).rejects.toThrow(/recorded moments ago/i);
  });

  it("supplier return cannot be cancelled twice", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 3" },
    });
    const material = await seedMaterial(100);
    const ret = await createSupplierReturn({
      supplierId: supplier.id, companyId: fx.company.id, locationId: fx.stockLocation.id,
      userId: fx.user.id, lines: [{ materialId: material.id, qty: 1, unitCost: 10 }],
    });
    await cancelSupplierReturn(ret.id, fx.user.id);
    await expect(cancelSupplierReturn(ret.id, fx.user.id)).rejects.toThrow(/already cancelled/i);
  });
});

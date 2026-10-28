/**
 * Inter-company STO GL correctness + completed-transfer reversal (EGM M6),
 * exercised against a real DB.
 *
 * Two invariants:
 *   1. GL posts exactly Σ qty × TP (freight/handling are already allocated
 *      inside unitTransferPrice — adding them again double-books them).
 *      Markup lands on 4200; freight+handling recovery lands on 4100.
 *   2. reverseCompletedTransfer unwinds stock at recorded costs, reverses
 *      both companies' journals, and refuses when stock was consumed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./test/setup";
import { createTransfer, dispatchTransfer, completeTransfer, reverseCompletedTransfer } from "./transfer";
import { recordMovement } from "./stock-ledger";

async function seedTwoCompanies() {
  const fx = await createTestFixture(); // company A ("test-company"), source location
  const companyB = await prisma.company.create({
    data: { id: "test-company-b", name: "Group SPV B", currency: "INR" },
  });
  const destLocation = await prisma.stockLocation.create({
    data: { id: "test-location-b", companyId: companyB.id, name: "SPV B Site", type: "PROJECT_SITE" },
  });
  const category = await prisma.materialCategory.create({
    data: { companyId: fx.company.id, name: "Civil" },
  });
  const material = await prisma.material.create({
    data: { companyId: fx.company.id, categoryId: category.id, code: "STL-001", name: "TMT Steel 12mm", unit: "KG" },
  });
  await seedTestAccounts(fx.company.id);
  await seedTestAccounts(companyB.id);
  // 100 kg at ₹50/kg at the source
  await prisma.$transaction(async (tx) => {
    await recordMovement(tx, {
      materialId: material.id,
      movementType: "PURCHASE_RECEIPT",
      toLocationId: fx.stockLocation.id,
      qty: new Decimal(100),
      unitCost: new Decimal(50),
      refType: "SEED",
      companyId: fx.company.id,
    });
  });
  return { ...fx, companyB, destLocation, material };
}

async function completeIcTransfer(fx: Awaited<ReturnType<typeof seedTwoCompanies>>) {
  const transfer = await createTransfer({
    fromLocationId: fx.stockLocation.id,
    toLocationId: fx.destLocation.id,
    userId: fx.user.id,
    companyGroupIds: [fx.company.id, fx.companyB.id],
    freight: 100,   // header freight — allocated into the unit TP
    handlingFee: 50,
    markupPct: 10,  // 10% of base cost 5000 = 500
    lines: [{ materialId: fx.material.id, qty: 100 }],
  });
  // The auto-created gate pass gates dispatch — approve it.
  await prisma.gatePass.updateMany({
    where: { refType: "StockTransfer", refId: transfer.id },
    data: { status: "APPROVED", approvedById: fx.user.id, approvedAt: new Date() },
  });
  await dispatchTransfer(transfer.id, fx.user.id, {});
  return completeTransfer(transfer.id, fx.user.id);
}

beforeEach(resetDb);

describe("inter-company STO GL posting", () => {
  it("posts Σ qty×TP once — freight/handling inside the unit price, not added again", async () => {
    const fx = await seedTwoCompanies();
    const transfer = await completeIcTransfer(fx);

    // base 5000 + freight 100 + handling 50 + markup 500 = TP 5650
    const jes = await prisma.journalEntry.findMany({
      where: { sourceId: transfer.id, sourceType: "STOCK_TRANSFER" },
      include: { lines: { include: { account: true } } },
    });
    expect(jes).toHaveLength(2);

    const src = jes.find((j) => j.companyId === fx.company.id)!;
    const dest = jes.find((j) => j.companyId === fx.companyB.id)!;

    const debit = (j: typeof src, code: string) =>
      j.lines.filter((l) => l.account.code === code).reduce((s, l) => s.plus(l.debit), new Decimal(0));
    const credit = (j: typeof src, code: string) =>
      j.lines.filter((l) => l.account.code === code).reduce((s, l) => s.plus(l.credit), new Decimal(0));

    // Destination: Dr INVENTORY 5650 / Cr IC Payable 5650 — NO double-added freight.
    expect(debit(dest, "1300").toNumber()).toBe(5650);
    expect(credit(dest, "2050").toNumber()).toBe(5650);

    // Source: Dr IC Receivable 5650 / Cr Inventory 5000 / Cr markup 500 / Cr recovery 150.
    expect(debit(src, "1950").toNumber()).toBe(5650);
    expect(credit(src, "1300").toNumber()).toBe(5000);
    expect(credit(src, "4200").toNumber()).toBe(500);  // true margin only
    expect(credit(src, "4100").toNumber()).toBe(150);  // freight+handling recovery, not margin
  });
});

describe("reverseCompletedTransfer", () => {
  it("restores both MACs and reverses both companies' journals", async () => {
    const fx = await seedTwoCompanies();
    const transfer = await completeIcTransfer(fx);

    const before = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.destLocation.id, materialId: fx.material.id } },
    });
    expect(before!.qty.toNumber()).toBe(100);

    const reversed = await reverseCompletedTransfer(transfer.id, fx.user.id, "Wrong material sent");
    expect(reversed.status).toBe("REVERSED");
    expect(reversed.reversedById).toBe(fx.user.id);
    expect(reversed.reversalReason).toBe("Wrong material sent");

    // Source holds 100 kg again at the ORIGINAL ₹50 MAC (not blended at ₹56.50 TP).
    const srcItem = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: fx.material.id } },
    });
    expect(srcItem!.qty.toNumber()).toBe(100);
    expect(srcItem!.movingAvgCost.toNumber()).toBeCloseTo(50, 2);

    // Destination is empty.
    const destItem = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.destLocation.id, materialId: fx.material.id } },
    });
    expect(destItem!.qty.toNumber()).toBe(0);

    // Both journals reversed — balances net to zero on both companies.
    const reversals = await prisma.journalEntry.findMany({
      where: { sourceId: transfer.id, sourceType: "STOCK_TRANSFER_REVERSAL" },
    });
    expect(reversals).toHaveLength(2);
    const companies = new Set(reversals.map((r) => r.companyId));
    expect(companies).toEqual(new Set([fx.company.id, fx.companyB.id]));
  });

  it("requires a reason", async () => {
    const fx = await seedTwoCompanies();
    const transfer = await completeIcTransfer(fx);
    await expect(reverseCompletedTransfer(transfer.id, fx.user.id)).rejects.toThrow(/reason/i);
    await expect(reverseCompletedTransfer(transfer.id, fx.user.id, "   ")).rejects.toThrow(/reason/i);
    const after = await prisma.stockTransfer.findUnique({ where: { id: transfer.id } });
    expect(after!.status).toBe("COMPLETED");
  });

  it("refuses a second reversal", async () => {
    const fx = await seedTwoCompanies();
    const transfer = await completeIcTransfer(fx);
    await reverseCompletedTransfer(transfer.id, fx.user.id, "dup");
    await expect(reverseCompletedTransfer(transfer.id, fx.user.id, "again")).rejects.toThrow(/COMPLETED/);
  });

  it("refuses when destination stock was consumed", async () => {
    const fx = await seedTwoCompanies();
    const transfer = await completeIcTransfer(fx);
    // Consume 10 kg at the destination — an honest reversal is now impossible.
    await prisma.$transaction(async (tx) => {
      await recordMovement(tx, {
        materialId: fx.material.id,
        movementType: "ADJUSTMENT_OUT",
        fromLocationId: fx.destLocation.id,
        qty: new Decimal(10),
        refType: "TEST",
        companyId: fx.companyB.id,
      });
    });
    await expect(reverseCompletedTransfer(transfer.id, fx.user.id, "consumed")).rejects.toThrow(/consumed/i);
    // Status untouched.
    const after = await prisma.stockTransfer.findUnique({ where: { id: transfer.id } });
    expect(after!.status).toBe("COMPLETED");
  });
});

/**
 * Integration tests for voidAssetSalePayment — undoing a mis-entered payment.
 *
 *   Deposit void:     status→VOID, depositAmount→0, saleStage→PENDING,
 *                     refund JE posted (Dr Customer Deposit / Cr Cash).
 *   Completion void:  status→VOID, paymentStatus→PARTIAL, AR re-opens
 *                     (Dr AR / Cr Cash reversal JE).
 *   Guards:           double-void throws; cancelled sale throws.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("voidAssetSalePayment", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const customer = await prisma.customer.create({
      data: { companyId: fixture.company.id, name: "Test Buyer", phone: "9999999999" },
    });
    const unit = await prisma.builtUnit.create({
      data: {
        projectId: "test-project",
        unitType: "BHK_2",
        unitNumber: "A-101",
        floor: 1,
        area: new Decimal(1000),
        areaUnit: "SQFT",
        status: "AVAILABLE",
        productionCost: new Decimal(2000000),
      },
    });
    return { ...fixture, customer, unit };
  }

  it("voids a deposit payment — sale returns to PENDING with a refund JE", async () => {
    const { company, user, customer, unit } = await setup();
    const { sellAsset, recordDeposit, voidAssetSalePayment } = await import("../sale");

    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });

    const dep = await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(500000),
      paymentMode: "BANK",
      reference: "UTR-VOID-1",
      userId: user.id,
    });

    const result = await voidAssetSalePayment({
      paymentId: dep.payment.id,
      userId: user.id,
      reason: "entered twice by mistake",
    });

    expect(result.paymentStatus).toBe("PENDING");

    const payment = await prisma.assetSalePayment.findUnique({ where: { id: dep.payment.id } });
    expect(payment!.status).toBe("VOID");

    const after = await prisma.assetSale.findUnique({ where: { id: sale.id } });
    expect(after!.depositAmount!.toNumber()).toBe(0);
    expect(after!.saleStage).toBe("PENDING");
    expect(after!.paymentStatus).toBe("PENDING");

    const refund = await prisma.journalEntry.findFirst({
      where: { sourceType: "ASSET_SALE_DEPOSIT_REFUND", sourceId: sale.id },
      include: { lines: true },
    });
    expect(refund).not.toBeNull();
    expect(refund!.lines.reduce((s, l) => s.plus(l.credit), new Decimal(0)).toNumber()).toBe(500000);
  });

  it("voids a post-completion payment — AR re-opens via reversal JE", async () => {
    const { company, user, customer, unit } = await setup();
    const { sellAsset, recordDeposit, completeSale, recordPayment, voidAssetSalePayment } = await import("../sale");

    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });

    await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(1000000),
      paymentMode: "BANK",
      userId: user.id,
    });

    await completeSale({
      saleId: sale.id,
      userId: user.id,
      registryDocumentUrl: "https://x/registry.pdf",
      atsDocumentUrl: "https://x/ats.pdf",
      finalPaymentAmount: new Decimal(4000000),
    });

    // Sale is COMPLETED + PAID. A further post-completion payment can only
    // exist if the final payment was partial — emulate by voiding the final
    // payment row itself (which is what a mis-entered-payment fix looks like).
    const payments = await prisma.assetSalePayment.findMany({
      where: { assetSaleId: sale.id },
      orderBy: { paymentDate: "desc" },
    });
    const finalPayment = payments[0];
    if (!finalPayment) throw new Error("expected a payment row");

    const result = await voidAssetSalePayment({
      paymentId: finalPayment.id,
      userId: user.id,
      reason: "wrong amount keyed",
    });

    expect(result.paymentStatus).toBe("PARTIAL");

    const payment = await prisma.assetSalePayment.findUnique({ where: { id: finalPayment.id } });
    expect(payment!.status).toBe("VOID");

    const after = await prisma.assetSale.findUnique({ where: { id: sale.id } });
    expect(after!.paymentStatus).toBe("PARTIAL");

    // Either a PAYMENT_RECEIVED reversal keyed to the payment, or the
    // deposit-settle mirror — books must net the cash out.
    const reversal = await prisma.journalEntry.findFirst({
      where: { sourceId: finalPayment.id, sourceType: { contains: "REVERSAL" } },
      include: { lines: true },
    });
    expect(reversal).not.toBeNull();

    // Double-void must throw
    await expect(voidAssetSalePayment({ paymentId: finalPayment.id })).rejects.toThrow("already void");
  });

  it("rejects voiding a payment on a cancelled sale", async () => {
    const { company, user, customer, unit } = await setup();
    const { sellAsset, recordDeposit, voidAssetSalePayment } = await import("../sale");

    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });
    const dep = await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(500000),
      paymentMode: "BANK",
      userId: user.id,
    });
    await prisma.assetSale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });

    await expect(
      voidAssetSalePayment({ paymentId: dep.payment.id, userId: user.id }),
    ).rejects.toThrow("cancelled sale");
  });
});

describe("capitalization catch-up on sale", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("capitalizes post-AVAILABLE cost before COGS — 1800 never goes credit-negative", async () => {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const customer = await prisma.customer.create({
      data: { companyId: fixture.company.id, name: "Buyer", phone: "9999999999" },
    });
    // Simulate a unit that went AVAILABLE before its costs finished landing:
    // productionCost ₹20L, only ₹15L ever capitalized into 1800.
    const unit = await prisma.builtUnit.create({
      data: {
        projectId: "test-project",
        unitType: "BHK_2",
        unitNumber: "B-201",
        area: new Decimal(1200),
        areaUnit: "SQFT",
        status: "AVAILABLE",
        originType: "CREATED",
        productionCost: new Decimal(2000000),
        capitalizedAmount: new Decimal(1500000),
      },
    });
    const { sellAsset, recordDeposit, completeSale } = await import("../sale");

    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: fixture.company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });
    await recordDeposit({ saleId: sale.id, depositAmount: new Decimal(5000000), paymentMode: "BANK", userId: fixture.user.id });
    await completeSale({
      saleId: sale.id,
      userId: fixture.user.id,
      registryDocumentUrl: "https://x/registry.pdf",
      atsDocumentUrl: "https://x/ats.pdf",
    });

    // The ₹5L gap must have been capitalized into 1800 before COGS released it.
    const cap = await prisma.journalEntry.findFirst({
      where: { sourceType: "WIP_CAPITALIZATION", sourceId: unit.id },
      include: { lines: true },
    });
    expect(cap).not.toBeNull();
    expect(cap!.lines.find((l) => l.debit.gt(0))!.debit.toNumber()).toBe(500000);

    const after = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(after!.capitalizedAmount.toString()).toBe("2000000");
  });
});

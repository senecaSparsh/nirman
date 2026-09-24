/**
 * Integration tests for voidMaterialSalePayment — undoing a mis-entered
 * material-sale payment: status→VOID, sale paymentStatus recomputed,
 * GL entry reversed, voided payments excluded from paid-sums.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("voidMaterialSalePayment", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const customer = await prisma.customer.create({
      data: { companyId: fixture.company.id, name: "Test Buyer", phone: "9999999999" },
    });
    const sale = await prisma.materialSale.create({
      data: {
        companyId: fixture.company.id,
        customerId: customer.id,
        saleNumber: `MS-TEST-${Math.random().toString(36).slice(2, 8)}`,
        subtotal: new Decimal(10000),
        totalAmount: new Decimal(10000),
      },
    });
    return { ...fixture, sale };
  }

  it("voids a payment — paymentStatus recomputes, JE reversed, re-payment allowed", async () => {
    const { company, user, sale } = await setup();
    const { createMaterialSalePayment, voidMaterialSalePayment } = await import("../sale-payment");

    const payment = await createMaterialSalePayment({
      saleId: sale.id,
      companyId: company.id,
      amount: "10000",
      paymentMode: "UPI",
      referenceNo: "UTR-VOID-1",
      userId: user.id,
    });
    expect((await prisma.materialSale.findUnique({ where: { id: sale.id } }))!.paymentStatus).toBe("PAID");

    await voidMaterialSalePayment({ paymentId: payment.id, companyId: company.id, userId: user.id, reason: "wrong amount" });

    const after = await prisma.materialSalePayment.findUnique({ where: { id: payment.id } });
    expect(after!.status).toBe("VOID");
    expect((await prisma.materialSale.findUnique({ where: { id: sale.id } }))!.paymentStatus).toBe("PENDING");

    const reversal = await prisma.journalEntry.findFirst({
      where: { sourceId: payment.id, sourceType: "MATERIAL_SALE_PAYMENT_REVERSAL" },
    });
    expect(reversal).not.toBeNull();

    // Voided payment doesn't block the corrected payment (same ref reusable)
    const good = await createMaterialSalePayment({
      saleId: sale.id,
      companyId: company.id,
      amount: "10000",
      paymentMode: "BANK",
      referenceNo: "UTR-VOID-1",
      userId: user.id,
    });
    expect(good.id).toBeTruthy();
    expect((await prisma.materialSale.findUnique({ where: { id: sale.id } }))!.paymentStatus).toBe("PAID");

    await expect(
      voidMaterialSalePayment({ paymentId: payment.id, companyId: company.id }),
    ).rejects.toThrow("already void");
  });

  it("partial void — PAID drops to PARTIAL", async () => {
    const { company, user, sale } = await setup();
    const { createMaterialSalePayment, voidMaterialSalePayment } = await import("../sale-payment");

    const p1 = await createMaterialSalePayment({ saleId: sale.id, companyId: company.id, amount: "6000", paymentMode: "CASH", userId: user.id });
    await createMaterialSalePayment({ saleId: sale.id, companyId: company.id, amount: "4000", paymentMode: "CASH", userId: user.id });
    expect((await prisma.materialSale.findUnique({ where: { id: sale.id } }))!.paymentStatus).toBe("PAID");

    await voidMaterialSalePayment({ paymentId: p1.id, companyId: company.id, userId: user.id });
    expect((await prisma.materialSale.findUnique({ where: { id: sale.id } }))!.paymentStatus).toBe("PARTIAL");
  });
});

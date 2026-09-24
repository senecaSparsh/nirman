/**
 * Integration tests for voidSupplierPayment — undoing a mis-entered payment.
 *
 *   Void:   status→VOID, supplier balanceOwed restored, GL entry reversed,
 *           invoices it paid re-open to APPROVED.
 *   Sums:   every payment aggregate excludes VOID rows — a voided payment
 *           doesn't count toward PO/invoice totals or block re-entry.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("voidSupplierPayment", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup(balanceOwed = "50000") {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const supplier = await prisma.supplier.create({
      data: { companyId: fixture.company.id, name: "Test Supplier", balanceOwed: new Decimal(balanceOwed) },
    });
    return { ...fixture, supplier };
  }

  it("voids a payment — balance restored, JE reversed, invoice re-opens", async () => {
    const { company, user, supplier } = await setup("40000");
    const { createSupplierPayment, voidSupplierPayment } = await import("../supplier-payment");

    const inv = await prisma.supplierInvoice.create({
      data: {
        companyId: company.id,
        supplierId: supplier.id,
        invoiceNumber: "INV-VOID-1",
        invoiceDate: new Date("2026-09-01"),
        subtotal: new Decimal(10000),
        gstAmount: new Decimal(0),
        totalAmount: new Decimal(10000),
        status: "APPROVED",
      },
    });

    const payment = await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      amount: "10000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    // Payment applied: balance dropped, invoice went PAID
    expect((await prisma.supplier.findUnique({ where: { id: supplier.id } }))!.balanceOwed.toString()).toBe("30000");
    expect((await prisma.supplierInvoice.findUnique({ where: { id: inv.id } }))!.status).toBe("PAID");

    await voidSupplierPayment({ paymentId: payment.id, companyId: company.id, userId: user.id, reason: "wrong amount keyed" });

    const after = await prisma.supplierPayment.findUnique({ where: { id: payment.id } });
    expect(after!.status).toBe("VOID");
    expect(after!.voidReason).toBe("wrong amount keyed");

    // Balance restored
    expect((await prisma.supplier.findUnique({ where: { id: supplier.id } }))!.balanceOwed.toString()).toBe("40000");
    // Invoice re-opened for re-payment
    expect((await prisma.supplierInvoice.findUnique({ where: { id: inv.id } }))!.status).toBe("APPROVED");
    // Reversal JE posted
    const reversal = await prisma.journalEntry.findFirst({
      where: { sourceId: payment.id, sourceType: "SUPPLIER_PAYMENT_REVERSAL" },
    });
    expect(reversal).not.toBeNull();

    // Double-void throws
    await expect(
      voidSupplierPayment({ paymentId: payment.id, companyId: company.id }),
    ).rejects.toThrow("already void");
  });

  it("a voided payment does not count toward invoice totals — corrected payment can re-pay", async () => {
    const { company, user, supplier } = await setup("20000");
    const { createSupplierPayment, voidSupplierPayment } = await import("../supplier-payment");

    const inv = await prisma.supplierInvoice.create({
      data: {
        companyId: company.id,
        supplierId: supplier.id,
        invoiceNumber: "INV-VOID-2",
        invoiceDate: new Date("2026-09-01"),
        subtotal: new Decimal(15000),
        gstAmount: new Decimal(0),
        totalAmount: new Decimal(15000),
        status: "APPROVED",
      },
    });

    const bad = await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      invoiceId: inv.id,
      amount: "15000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });
    await voidSupplierPayment({ paymentId: bad.id, companyId: company.id, userId: user.id });

    // The corrected payment of the same amount must not hit the overpayment guard
    const good = await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      invoiceId: inv.id,
      amount: "15000",
      paymentMode: "UPI",
      userId: user.id,
    });
    expect(good.id).toBeTruthy();
    expect((await prisma.supplierInvoice.findUnique({ where: { id: inv.id } }))!.status).toBe("PAID");
  });
});

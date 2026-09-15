/**
 * Integration tests for supplier-payment → invoice reconciliation.
 *
 * An invoice is PAID only once cumulative payments cover its total:
 *   - linked payments earmark their invoice
 *   - unlinked payments allocate FIFO (oldest first) across open invoices
 *   - a partial payment must never mark an invoice PAID
 *
 * Regression coverage for:
 *   1. unlinked payments previously never reconciled invoices (invoice stayed
 *      APPROVED forever while supplier balance hit zero)
 *   2. any linked payment previously marked the invoice PAID unconditionally,
 *      even a partial one
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { createSupplierPayment } from "../supplier-payment";

describe("Supplier payment → invoice reconciliation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup(balanceOwed = "50000") {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const supplier = await prisma.supplier.create({
      data: {
        companyId: fixture.company.id,
        name: "Test Supplier",
        balanceOwed: new Decimal(balanceOwed),
      },
    });
    return { ...fixture, supplier };
  }

  async function createInvoice(
    companyId: string,
    supplierId: string,
    total: string,
    opts: { invoiceDate?: Date; status?: string } = {},
  ) {
    return prisma.supplierInvoice.create({
      data: {
        companyId,
        supplierId,
        invoiceNumber: `INV-${Math.random().toString(36).slice(2, 8)}`,
        invoiceDate: opts.invoiceDate ?? new Date("2026-09-01"),
        subtotal: new Decimal(total),
        gstAmount: new Decimal(0),
        totalAmount: new Decimal(total),
        status: opts.status ?? "APPROVED",
      },
    });
  }

  it("marks an open invoice PAID when an unlinked payment covers it", async () => {
    const { company, user, supplier } = await setup("23360");
    const inv = await createInvoice(company.id, supplier.id, "23360");

    await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      amount: "23360",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    const after = await prisma.supplierInvoice.findUnique({ where: { id: inv.id } });
    expect(after?.status).toBe("PAID");
  });

  it("does NOT mark an invoice PAID on a partial unlinked payment", async () => {
    const { company, user, supplier } = await setup("23360");
    const inv = await createInvoice(company.id, supplier.id, "23360");

    await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      amount: "10000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    const after = await prisma.supplierInvoice.findUnique({ where: { id: inv.id } });
    expect(after?.status).toBe("APPROVED");
  });

  it("does NOT mark an invoice PAID on a partial linked payment", async () => {
    const { company, user, supplier } = await setup("50000");
    const inv = await createInvoice(company.id, supplier.id, "23360");

    await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      invoiceId: inv.id,
      amount: "5000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    const after = await prisma.supplierInvoice.findUnique({ where: { id: inv.id } });
    expect(after?.status).toBe("APPROVED");
  });

  it("marks the invoice PAID once linked payments fully cover it", async () => {
    const { company, user, supplier } = await setup("50000");
    const inv = await createInvoice(company.id, supplier.id, "23360");

    await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      invoiceId: inv.id,
      amount: "10000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });
    await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      invoiceId: inv.id,
      amount: "13360",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    const after = await prisma.supplierInvoice.findUnique({ where: { id: inv.id } });
    expect(after?.status).toBe("PAID");
  });

  it("FIFO: unlinked payment covers the oldest open invoice first", async () => {
    const { company, user, supplier } = await setup("40000");
    const older = await createInvoice(company.id, supplier.id, "10000", {
      invoiceDate: new Date("2026-08-01"),
    });
    const newer = await createInvoice(company.id, supplier.id, "20000", {
      invoiceDate: new Date("2026-09-01"),
    });

    // Pay 25,000 — covers older (10k) + newer (20k) partially: only older flips.
    await createSupplierPayment({
      supplierId: supplier.id,
      companyId: company.id,
      amount: "25000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    const [oldAfter, newAfter] = await Promise.all([
      prisma.supplierInvoice.findUnique({ where: { id: older.id } }),
      prisma.supplierInvoice.findUnique({ where: { id: newer.id } }),
    ]);
    expect(oldAfter?.status).toBe("PAID");
    expect(newAfter?.status).toBe("APPROVED");
  });
});

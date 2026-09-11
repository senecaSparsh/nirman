/**
 * Integration tests for the full asset sale lifecycle:
 *   sellAsset → recordDeposit → completeSale
 *
 * These tests verify the money-moving path end-to-end against a real
 * Postgres database — GL postings, status transitions, asset marking,
 * and deposit settlement.  This is the highest-risk path in the system
 * (revenue recognition, GL correctness) and was at 5.7% coverage before.
 *
 * Lifecycle:
 *   1. sellAsset (BUILT_UNIT, no initial payment) → sale PENDING, unit AVAILABLE
 *   2. recordDeposit → sale DEPOSIT_RECEIVED, unit RESERVED, Dr Cash / Cr Deposit
 *   3. completeSale → sale COMPLETED, unit SOLD, revenue + COGS + deposit settle
 *
 * GL flow:
 *   sellAsset:   (no GL if no initial payment)
 *   recordDeposit: Dr Cash / Cr Customer Deposits
 *   completeSale:
 *     - Dr AR / Cr Sales Revenue (+ Cr Output GST if applicable)   [postAssetSale]
 *     - Dr COGS / Cr Unit Asset                                     [postAssetSale]
 *     - Dr Customer Deposits / Cr AR                                [deposit settle]
 *     - Dr Cash / Cr AR (final payment, if any)                     [postPaymentReceived]
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { ACCT } from "../gl-posting";

describe("Sale lifecycle — sellAsset → recordDeposit → completeSale", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    return fixture;
  }

  /** Create a customer for the sale. */
  async function createCustomer(companyId: string, name = "Test Buyer") {
    return prisma.customer.create({
      data: { companyId, name, phone: "9999999999" },
    });
  }

  /** Create a built unit in AVAILABLE status with a production cost. */
  async function createBuiltUnit(projectId: string, area = new Decimal(1000), productionCost = new Decimal(2000000)) {
    return prisma.builtUnit.create({
      data: {
        projectId,
        unitType: "BHK_2",
        unitNumber: "A-101",
        floor: 1,
        wing: "A",
        area,
        areaUnit: "SQFT",
        status: "AVAILABLE",
        productionCost,
      },
    });
  }

  /** Get all journal entries for a sale (by sourceId or line entityId). */
  async function getSaleJournalEntries(saleId: string) {
    return prisma.journalEntry.findMany({
      where: {
        OR: [
          { sourceId: saleId },
          { lines: { some: { entityId: saleId } } },
        ],
      },
      include: { lines: { include: { account: { select: { code: true } } } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Sum all debits/credits for a given account across all sale entries. */
  function sumAccount(entries: { lines: { account: { code: string }; debit: Decimal; credit: Decimal }[] }[], accountCode: string) {
    return entries.reduce(
      (acc, e) => {
        for (const l of e.lines) {
          if (l.account.code === accountCode) {
            acc.debit = acc.debit.plus(l.debit);
            acc.credit = acc.credit.plus(l.credit);
          }
        }
        return acc;
      },
      { debit: new Decimal(0), credit: new Decimal(0) },
    );
  }

  // ── sellAsset ──

  it("sellAsset creates sale in PENDING stage with AVAILABLE unit (no initial payment)", async () => {
    const { company } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });

    expect(sale.saleStage).toBe("PENDING");
    expect(sale.paymentStatus).toBe("PENDING");
    expect(sale.status).toBe("ACTIVE");

    // Unit should still be AVAILABLE (no deposit yet)
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.status).toBe("AVAILABLE");

    // No GL entries should be posted yet (no payment)
    const entries = await getSaleJournalEntries(sale.id);
    expect(entries).toHaveLength(0);
  });

  it("sellAsset with initial payment creates sale in DEPOSIT_RECEIVED with RESERVED unit", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      initialPayment: new Decimal(500000),
      initialPaymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    // sellAsset returns the original sale object before the stage update.
    // Re-read to get the persisted stage.
    const persistedSale = await prisma.assetSale.findUnique({ where: { id: sale.id } });
    expect(persistedSale!.saleStage).toBe("DEPOSIT_RECEIVED");
    expect(persistedSale!.paymentStatus).toBe("PARTIAL");

    // Unit should be RESERVED
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.status).toBe("RESERVED");

    // GL: Dr Cash / Cr Customer Deposits
    const entries = await getSaleJournalEntries(sale.id);
    const cash = sumAccount(entries, ACCT.CASH);
    const deposit = sumAccount(entries, ACCT.CUSTOMER_DEPOSIT);
    expect(cash.debit.toNumber()).toBe(500000);
    expect(deposit.credit.toNumber()).toBe(500000);
  });

  it("sellAsset rejects double-sell of the same unit", async () => {
    const { company } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset } = await import("../sale");
    await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });

    await expect(
      sellAsset({
        assetType: "BUILT_UNIT",
        builtUnitId: unit.id,
        companyId: company.id,
        customerId: customer.id,
        salePrice: new Decimal(6000000),
      }),
    ).rejects.toThrow(/status|AVAILABLE|sold/i);
  });

  it("sellAsset rejects zero sale price", async () => {
    const { company } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset } = await import("../sale");
    await expect(
      sellAsset({
        assetType: "BUILT_UNIT",
        builtUnitId: unit.id,
        companyId: company.id,
        customerId: customer.id,
        salePrice: 0,
      }),
    ).rejects.toThrow("Sale price must be > 0");
  });

  // ── recordDeposit ──

  it("recordDeposit transitions PENDING → DEPOSIT_RECEIVED and marks unit RESERVED", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });

    const result = await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(1000000),
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    expect(result.saleStage).toBe("DEPOSIT_RECEIVED");
    expect(result.paymentStatus).toBe("PARTIAL");

    // Unit should be RESERVED
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.status).toBe("RESERVED");

    // GL: Dr Cash / Cr Customer Deposits
    const entries = await getSaleJournalEntries(sale.id);
    const cash = sumAccount(entries, ACCT.CASH);
    const deposit = sumAccount(entries, ACCT.CUSTOMER_DEPOSIT);
    expect(cash.debit.toNumber()).toBe(1000000);
    expect(deposit.credit.toNumber()).toBe(1000000);
  });

  it("recordDeposit rejects deposit exceeding total collectible", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
    });

    await expect(
      recordDeposit({
        saleId: sale.id,
        depositAmount: new Decimal(6000000),
        userId: user.id,
      }),
    ).rejects.toThrow(/exceed/);
  });

  it("recordDeposit rejects deposit on completed sale", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit, completeSale } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      initialPayment: new Decimal(5000000), // full payment
      userId: user.id,
    });

    // Upload ATS doc so completeSale doesn't fail on document gate
    await prisma.assetSale.update({
      where: { id: sale.id },
      data: { atsDocumentUrl: "https://example.com/ats.pdf" },
    });

    await completeSale({
      saleId: sale.id,
      registryDocumentUrl: "https://example.com/registry.pdf",
      userId: user.id,
    });

    await expect(
      recordDeposit({
        saleId: sale.id,
        depositAmount: new Decimal(100000),
        userId: user.id,
      }),
    ).rejects.toThrow("already completed");
  });

  // ── completeSale ──

  it("completeSale posts revenue + COGS + settles deposits + marks unit SOLD", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit, completeSale } = await import("../sale");

    // 1. Create sale
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      userId: user.id,
    });

    // 2. Record deposit (1M of 5M)
    await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(1000000),
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    // Upload ATS doc
    await prisma.assetSale.update({
      where: { id: sale.id },
      data: { atsDocumentUrl: "https://example.com/ats.pdf" },
    });

    // 3. Complete sale with final payment (4M)
    await completeSale({
      saleId: sale.id,
      finalPaymentAmount: new Decimal(4000000),
      paymentMode: "BANK_TRANSFER",
      registryDocumentUrl: "https://example.com/registry.pdf",
      saleDeedNo: "SD-2026-001",
      userId: user.id,
    });

    // Verify sale stage
    const completedSale = await prisma.assetSale.findUnique({ where: { id: sale.id } });
    expect(completedSale!.saleStage).toBe("COMPLETED");
    expect(completedSale!.paymentStatus).toBe("PAID");
    expect(completedSale!.finalSaleDate).not.toBeNull();
    expect(completedSale!.saleDeedNo).toBe("SD-2026-001");

    // Unit should be SOLD
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.status).toBe("SOLD");

    // ── Verify GL ──
    const entries = await getSaleJournalEntries(sale.id);

    // Revenue: Dr AR 5M / Cr Sales Revenue 5M
    const ar = sumAccount(entries, ACCT.AR);
    const revenue = sumAccount(entries, ACCT.SALES_REVENUE);
    expect(ar.debit.toNumber()).toBe(5000000);
    expect(revenue.credit.toNumber()).toBe(5000000);

    // COGS: Dr COGS / Cr Unit Asset
    const cogs = sumAccount(entries, ACCT.COGS);
    const unitAsset = sumAccount(entries, ACCT.UNIT_ASSET);
    expect(cogs.debit.toNumber()).toBeGreaterThan(0);
    expect(unitAsset.credit.toNumber()).toBe(cogs.debit.toNumber());

    // Deposit settlement: Dr Customer Deposits 1M / Cr AR 1M
    const deposit = sumAccount(entries, ACCT.CUSTOMER_DEPOSIT);
    expect(deposit.debit.toNumber()).toBe(1000000); // reversed
    expect(deposit.credit.toNumber()).toBe(1000000); // originally posted

    // Final payment: Dr Cash 4M / Cr AR 4M
    const cash = sumAccount(entries, ACCT.CASH);
    expect(cash.debit.toNumber()).toBe(5000000); // 1M deposit + 4M final

    // AR should net to zero: Dr 5M (revenue) - Cr 1M (deposit settle) - Cr 4M (final payment) = 0
    const arNet = ar.debit.minus(ar.credit);
    expect(arNet.toNumber()).toBe(0);
  });

  it("completeSale rejects without registry document", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit, completeSale } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      userId: user.id,
    });

    await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(5000000),
      userId: user.id,
    });

    // Upload ATS but NO registry doc
    await prisma.assetSale.update({
      where: { id: sale.id },
      data: { atsDocumentUrl: "https://example.com/ats.pdf" },
    });

    await expect(
      completeSale({
        saleId: sale.id,
        userId: user.id,
      }),
    ).rejects.toThrow("registry document");
  });

  it("completeSale rejects without ATS or BBA document", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit, completeSale } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      userId: user.id,
    });

    await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(5000000),
      userId: user.id,
    });

    // NO ATS or BBA doc uploaded
    await expect(
      completeSale({
        saleId: sale.id,
        registryDocumentUrl: "https://example.com/registry.pdf",
        userId: user.id,
      }),
    ).rejects.toThrow("ATS or BBA");
  });

  it("completeSale rejects on cancelled sale", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, completeSale } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      userId: user.id,
    });

    // Cancel the sale
    await prisma.assetSale.update({
      where: { id: sale.id },
      data: { status: "CANCELLED" },
    });

    await expect(
      completeSale({
        saleId: sale.id,
        registryDocumentUrl: "https://example.com/registry.pdf",
        userId: user.id,
      }),
    ).rejects.toThrow("cancelled");
  });

  // ── Full lifecycle with GST ──

  it("full lifecycle with GST: revenue, output GST, and deposit settlement all balance", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit, completeSale } = await import("../sale");

    // Sale price 5M + 5% GST = 250K GST → total collectible 5.25M
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      gstRate: 5,
      userId: user.id,
    });

    // Verify GST was computed
    expect(sale.gstAmount.toNumber()).toBe(250000);

    // Deposit 1M
    await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(1000000),
      userId: user.id,
    });

    // Upload ATS
    await prisma.assetSale.update({
      where: { id: sale.id },
      data: { atsDocumentUrl: "https://example.com/ats.pdf" },
    });

    // Complete with final payment 4.25M (5.25M - 1M)
    await completeSale({
      saleId: sale.id,
      finalPaymentAmount: new Decimal(4250000),
      registryDocumentUrl: "https://example.com/registry.pdf",
      userId: user.id,
    });

    const entries = await getSaleJournalEntries(sale.id);

    // Revenue: Dr AR 5.25M / Cr Sales Revenue 5M / Cr Output GST 250K
    const ar = sumAccount(entries, ACCT.AR);
    const revenue = sumAccount(entries, ACCT.SALES_REVENUE);
    const outputGst = sumAccount(entries, ACCT.OUTPUT_GST);
    expect(ar.debit.toNumber()).toBe(5250000);
    expect(revenue.credit.toNumber()).toBe(5000000);
    expect(outputGst.credit.toNumber()).toBe(250000);

    // Cash: 1M deposit + 4.25M final = 5.25M
    const cash = sumAccount(entries, ACCT.CASH);
    expect(cash.debit.toNumber()).toBe(5250000);

    // AR nets to zero
    const arNet = ar.debit.minus(ar.credit);
    expect(arNet.toNumber()).toBe(0);

    // All entries balanced
    for (const entry of entries) {
      expect(entry.totalDebit.toNumber()).toBe(entry.totalCredit.toNumber());
    }
  });

  // ── recordPayment GL routing ──

  it("recordPayment rejects on pre-completion (PENDING) sale — use recordDeposit instead", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordPayment } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      userId: user.id,
    });

    expect(sale.saleStage).toBe("PENDING");

    await expect(
      recordPayment({
        assetSaleId: sale.id,
        amount: new Decimal(500000),
        mode: "BANK_TRANSFER",
        userId: user.id,
      }),
    ).rejects.toThrow(/completed sales/);
  });

  it("recordPayment rejects on DEPOSIT_RECEIVED sale — use completeSale for final payment", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordDeposit, recordPayment } = await import("../sale");
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      userId: user.id,
    });

    await recordDeposit({
      saleId: sale.id,
      depositAmount: new Decimal(1000000),
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });

    await expect(
      recordPayment({
        assetSaleId: sale.id,
        amount: new Decimal(500000),
        mode: "BANK_TRANSFER",
        userId: user.id,
      }),
    ).rejects.toThrow(/completed sales/);
  });

  it("recordPayment rejects overpayment beyond sale price + GST on completed sale", async () => {
    const { company, user } = await setup();
    const customer = await createCustomer(company.id);
    const unit = await createBuiltUnit("test-project");

    const { sellAsset, recordPayment } = await import("../sale");
    // Create sale with full initial payment → DEPOSIT_RECEIVED
    const sale = await sellAsset({
      assetType: "BUILT_UNIT",
      builtUnitId: unit.id,
      companyId: company.id,
      customerId: customer.id,
      salePrice: new Decimal(5000000),
      initialPayment: new Decimal(5000000),
      userId: user.id,
    });

    // Upload ATS doc and complete the sale
    await prisma.assetSale.update({
      where: { id: sale.id },
      data: { atsDocumentUrl: "https://example.com/ats.pdf" },
    });
    const { completeSale } = await import("../sale");
    await completeSale({
      saleId: sale.id,
      registryDocumentUrl: "https://example.com/registry.pdf",
      userId: user.id,
    });

    // Now try to record an additional payment that exceeds total
    await expect(
      recordPayment({
        assetSaleId: sale.id,
        amount: new Decimal(1000000),
        mode: "BANK_TRANSFER",
        userId: user.id,
      }),
    ).rejects.toThrow(/Overpayment/);
  });
});

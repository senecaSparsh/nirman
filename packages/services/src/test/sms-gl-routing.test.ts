/**
 * Integration test for the SMS GL routing fix (CRITICAL bug).
 *
 * Bug: matchPayment and manualMatchSms in sms-parser.ts always called
 *   postPaymentReceived (Dr Cash / Cr AR) for ASSET_SALE payments,
 *   regardless of saleStage.  This caused pre-completion payments to
 *   post to Accounts Receivable instead of Customer Deposits, breaking
 *   the deposit-settlement in completeSale.
 *
 * Fix: both functions now check sale.saleStage === "COMPLETED" and route
 *   to postDepositReceived for pre-completion payments, mirroring the
 *   logic in sale.ts:recordPayment.
 *
 * These integration tests verify the GL is posted to the correct account
 * for both pre-completion and post-completion sales, via manualMatchSms
 * (the deterministic path — matchPayment relies on amount matching).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { ACCT } from "../gl-posting";

describe("SMS GL routing fix — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    return fixture;
  }

  /** Create a customer + asset sale at the given saleStage. */
  async function createSale(companyId: string, saleStage: string, salePrice: Decimal) {
    const customer = await prisma.customer.create({
      data: { companyId, name: "Test Buyer", phone: "9999999999" },
    });

    const sale = await prisma.assetSale.create({
      data: {
        companyId,
        customerId: customer.id,
        assetType: "BUILT_UNIT",
        salePrice,
        gstRate: new Decimal(0),
        gstAmount: new Decimal(0),
        costBasis: new Decimal(0),
        profit: salePrice,
        status: "ACTIVE",
        paymentStatus: "PENDING",
        saleStage,
        saleNumber: `SAL-TEST-${Date.now()}`,
      },
    });

    return { customer, sale };
  }

  /** Create a BankSms record with the given amount. */
  async function createSms(companyId: string, amount: Decimal) {
    return prisma.bankSms.create({
      data: {
        companyId,
        sender: "HDFCBK",
        message: `Rs.${amount}.00 credited to your a/c XX1234 via UPI. UPI Ref: 123456789012.`,
        receivedAt: new Date(),
        amount,
        upiRef: "123456789012",
        accountNo: "1234",
        bankName: "HDFC",
        txnType: "CREDIT",
        counterparty: "TEST BUYER",
        status: "UNMATCHED",
        smsHash: `hash-${Date.now()}-${Math.random()}`,
      },
    });
  }

  /** Find the journal entries posted for an asset sale (deposit or payment).
   *  postDepositReceived uses sourceType=ASSET_SALE_DEPOSIT, sourceId=assetSaleId.
   *  postPaymentReceived uses sourceType=PAYMENT_RECEIVED, sourceId=paymentId.
   *  We search by the entity on the journal lines (entityId=assetSaleId) to
   *  catch both cases.
   */
  async function findSaleJournalEntries(assetSaleId: string) {
    // Deposit entries: sourceId = assetSaleId
    const depositEntries = await prisma.journalEntry.findMany({
      where: { sourceType: "ASSET_SALE_DEPOSIT", sourceId: assetSaleId },
      include: { lines: true },
    });
    // Payment entries: lines have entityId = assetSaleId (on the AR line)
    const paymentEntries = await prisma.journalEntry.findMany({
      where: {
        lines: { some: { entityId: assetSaleId, accountCode: ACCT.AR } },
      },
      include: { lines: true },
    });
    return [...depositEntries, ...paymentEntries];
  }

  // ── Pre-completion: should post to Customer Deposits ──

  it("manualMatchSms posts to CUSTOMER_DEPOSIT (not AR) for pre-completion sale (PENDING)", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "PENDING", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(500000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const entries = await findSaleJournalEntries(sale.id);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    // The deposit entry should credit CUSTOMER_DEPOSIT, not AR
    const allLines = entries.flatMap((e) => e.lines);
    const depositCredit = allLines.find(
      (l) => l.accountCode === ACCT.CUSTOMER_DEPOSIT && l.credit.toNumber() > 0,
    );
    const arCredit = allLines.find(
      (l) => l.accountCode === ACCT.AR && l.credit.toNumber() > 0,
    );

    expect(depositCredit).toBeDefined();
    expect(depositCredit!.credit.toNumber()).toBe(500000);
    expect(arCredit).toBeUndefined(); // AR should NOT be credited pre-completion
  });

  it("manualMatchSms posts to CUSTOMER_DEPOSIT for DEPOSIT_RECEIVED stage", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "DEPOSIT_RECEIVED", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(1000000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const entries = await findSaleJournalEntries(sale.id);
    const allLines = entries.flatMap((e) => e.lines);
    const depositCredit = allLines.find(
      (l) => l.accountCode === ACCT.CUSTOMER_DEPOSIT && l.credit.toNumber() > 0,
    );
    const arCredit = allLines.find(
      (l) => l.accountCode === ACCT.AR && l.credit.toNumber() > 0,
    );

    expect(depositCredit).toBeDefined();
    expect(depositCredit!.credit.toNumber()).toBe(1000000);
    expect(arCredit).toBeUndefined();
  });

  // ── Post-completion: should post to Accounts Receivable ──

  it("manualMatchSms posts to AR (not CUSTOMER_DEPOSIT) for completed sale", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "COMPLETED", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(500000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const entries = await findSaleJournalEntries(sale.id);
    const allLines = entries.flatMap((e) => e.lines);
    const arCredit = allLines.find(
      (l) => l.accountCode === ACCT.AR && l.credit.toNumber() > 0,
    );
    const depositCredit = allLines.find(
      (l) => l.accountCode === ACCT.CUSTOMER_DEPOSIT && l.credit.toNumber() > 0,
    );

    expect(arCredit).toBeDefined();
    expect(arCredit!.credit.toNumber()).toBe(500000);
    expect(depositCredit).toBeUndefined(); // Deposit should NOT be credited post-completion
  });

  // ── GL entry is balanced ──

  it("pre-completion SMS payment creates a balanced journal entry (Dr Cash = Cr Deposit)", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "PENDING", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(750000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const entries = await findSaleJournalEntries(sale.id);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.totalDebit.toNumber()).toBe(750000);
    expect(entry.totalCredit.toNumber()).toBe(750000);

    // Verify Dr Cash
    const cashDebit = entry.lines.find((l) => l.accountCode === ACCT.CASH && l.debit.toNumber() > 0);
    expect(cashDebit).toBeDefined();
    expect(cashDebit!.debit.toNumber()).toBe(750000);
  });

  // ── Payment status updates correctly ──

  it("SMS payment updates sale paymentStatus to PARTIAL for pre-completion", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "PENDING", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(1000000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const updatedSale = await prisma.assetSale.findUnique({ where: { id: sale.id } });
    expect(updatedSale!.paymentStatus).toBe("PARTIAL");
  });

  it("SMS payment updates sale paymentStatus to PAID when full amount received", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "PENDING", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(5000000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const updatedSale = await prisma.assetSale.findUnique({ where: { id: sale.id } });
    expect(updatedSale!.paymentStatus).toBe("PAID");
  });

  // ── SMS status updates correctly ──

  it("manualMatchSms marks SMS as MATCHED", async () => {
    const { company } = await setup();
    const { sale } = await createSale(company.id, "PENDING", new Decimal(5000000));
    const sms = await createSms(company.id, new Decimal(500000));

    const { manualMatchSms } = await import("../sms-parser");
    await manualMatchSms({
      smsId: sms.id,
      companyId: company.id,
      entityType: "ASSET_SALE",
      entityId: sale.id,
    });

    const updatedSms = await prisma.bankSms.findUnique({ where: { id: sms.id } });
    expect(updatedSms!.status).toBe("MATCHED");
    expect(updatedSms!.matchedEntityType).toBe("ASSET_SALE");
    expect(updatedSms!.matchedEntityId).toBe(sale.id);
  });
});

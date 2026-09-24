/**
 * Integration tests for voidLandPurchasePayment — undoing a mis-entered
 * land payment: status→VOID, JE reversed (or token-leg correction),
 * bounced/voided payments excluded from committed sums, token reset.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("voidLandPurchasePayment", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const lp = await prisma.landPurchase.create({
      data: {
        companyId: fixture.company.id,
        sellerName: "Test Seller",
        totalArea: new Decimal(5000),
        totalCost: new Decimal(50000),
        purchaseStage: "BBA_SIGNED",
      },
    });
    return { ...fixture, lp };
  }

  it("voids a regular payment — JE reversed, sum excludes it, re-payment allowed", async () => {
    const { company, user, lp } = await setup();
    const { recordLandPurchasePayment, voidLandPurchasePayment } = await import("../land");

    const payment = await recordLandPurchasePayment({
      landPurchaseId: lp.id,
      amount: "20000",
      paymentMode: "BANK_TRANSFER",
      referenceNo: "UTR-LAND-1",
      userId: user.id,
    }).then((r) => r.payment);

    await voidLandPurchasePayment({ paymentId: payment.id, companyId: company.id, userId: user.id, reason: "wrong amount" });

    expect((await prisma.landPurchasePayment.findUnique({ where: { id: payment.id } }))!.status).toBe("VOID");
    const reversal = await prisma.journalEntry.findFirst({
      where: { sourceId: payment.id, sourceType: "LAND_PURCHASE_PAYMENT_REVERSAL" },
    });
    expect(reversal).not.toBeNull();

    // Voided payment doesn't count toward the total — full ₹50K can be re-paid
    const full = await recordLandPurchasePayment({
      landPurchaseId: lp.id,
      amount: "50000",
      paymentMode: "BANK_TRANSFER",
      userId: user.id,
    });
    expect(full.payment.id).toBeTruthy();

    await expect(
      voidLandPurchasePayment({ paymentId: payment.id, companyId: company.id }),
    ).rejects.toThrow("already void");
  });

  it("voids a pending cheque — no JE to reverse, just marked", async () => {
    const { company, user, lp } = await setup();
    const { recordLandPurchasePayment, voidLandPurchasePayment } = await import("../land");

    const payment = await recordLandPurchasePayment({
      landPurchaseId: lp.id,
      amount: "10000",
      paymentMode: "CHEQUE",
      chequeNo: "123456",
      userId: user.id,
    }).then((r) => r.payment);

    // Pending cheque → no GL posted yet
    const jeBefore = await prisma.journalEntry.findFirst({
      where: { sourceType: "LAND_PURCHASE_PAYMENT", sourceId: payment.id },
    });
    expect(jeBefore).toBeNull();

    await voidLandPurchasePayment({ paymentId: payment.id, companyId: company.id, userId: user.id });
    expect((await prisma.landPurchasePayment.findUnique({ where: { id: payment.id } }))!.status).toBe("VOID");
  });
});

import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { createHash } from "crypto";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { postPaymentReceived, postDepositReceived, postMaterialSalePayment, postJournalEntry, ACCT } from "./gl-posting";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { withSerializableTransaction } from "./transaction";

/**
 * SMS Parser Service — auto payment entry from bank SMS notifications.
 *
 * Indian banks send SMS alerts for every transaction. This service:
 *   1. Parses the SMS to extract amount, UPI ref, sender, date, bank
 *   2. De-duplicates by hashing sender+message+timestamp
 *   3. Auto-matches to existing sales/tenancies by amount
 *   4. Creates payment records when a match is found
 *
 * Supported SMS formats:
 *   - HDFC: "Rs.50000.00 has been credited to your a/c XX1234 via UPI..."
 *   - ICICI: "INR 25,000.00 credited to a/c XX5678. UPI Ref: 1234567890..."
 *   - SBI: "Rs.100000 credited to your account xxx1234 by UPI..."
 *   - Axis: "Rs.50000.00 credited to a/c XX9876 via IMPS..."
 *   - Generic UPI: "Rs.XXX debited from / credited to your a/c..."
 *
 * The client's request: "जो मुझे मैसेज आते हैं टेक्स्ट पे पेमेंट रिसीव्ड
 * वो ये पढ़ लो और क्रिएट कर दे" — read payment received SMS and auto-create.
 */

// ───────────────────────────────────────────────────────────
//  SMS PARSING — extract amount, UPI ref, bank, counterparty
// ───────────────────────────────────────────────────────────

export interface ParsedSms {
  amount: Decimal | null;
  upiRef: string | null;
  accountNo: string | null;
  bankName: string | null;
  txnType: "CREDIT" | "DEBIT" | "REFUND" | null;
  counterparty: string | null;
  receivedAt: Date | null;
}

// Bank detection from sender ID
const BANK_PATTERNS: Record<string, RegExp> = {
  HDFC: /HD-FB|HDFC|HDFCBANK/i,
  ICICI: /ICICI|ICICIB/i,
  SBI: /SBI|SBIBNK/i,
  AXIS: /AXIS|AXISBK/i,
  KOTAK: /KOTAK|KKBK/i,
  YES: /YESBNK|YES/i,
  IDFC: /IDFC|IDFCB/i,
  PNB: /PNB|PUNB/i,
  BOB: /BOB|BARODA/i,
  CANARA: /CANARA|CNRB/i,
  UPI: /UPI|BHIM|GPAY|PHONEPE|PAYTM|AMAZON/i,
};

function detectBank(sender: string): string | null {
  for (const [bank, pattern] of Object.entries(BANK_PATTERNS)) {
    if (pattern.test(sender)) return bank;
  }
  return null;
}

// Amount extraction — handles "Rs.50000.00", "INR 25,000.00", "Rs 100000"
const AMOUNT_REGEX = /(?:Rs\.?|INR)\s*\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;

// UPI reference extraction
const UPI_REF_REGEX = /(?:UPI\s*Ref(?:\.|No|Number)?)?\s*[:#]?\s*([0-9]{10,22})/i;

// Account number extraction — "a/c XX1234", "account xxx1234", "a/c no 1234"
const ACCOUNT_REGEX = /(?:a\/c(?:\s*no)?|account)\s*(?:no\.?\s*)?(?:[Xx]+)?([0-9]{3,8})/i;

// Transaction type detection
function detectTxnType(message: string): "CREDIT" | "DEBIT" | "REFUND" | null {
  const lower = message.toLowerCase();
  if (lower.includes("refund")) return "REFUND";
  if (lower.includes("credited") || lower.includes("received") || lower.includes("deposited") || lower.includes("credit")) return "CREDIT";
  if (lower.includes("debited") || lower.includes("withdrawn") || lower.includes("spent") || lower.includes("debit")) return "DEBIT";
  return null;
}

// Counterparty extraction — "from JOHN DOE", "by RAMESH KUMAR"
const COUNTERPARTY_REGEX = /(?:from|by)\s+([A-Z][A-Z\s]{3,30})/;

export function parseSms(sender: string, message: string, receivedAt?: Date): ParsedSms {
  const bankName = detectBank(sender);
  const txnType = detectTxnType(message);

  // Extract amount
  let amount: Decimal | null = null;
  const amountMatch = message.match(AMOUNT_REGEX);
  if (amountMatch?.[1]) {
    const cleaned = amountMatch[1].replace(/,/g, "");
    const parsed = new Decimal(cleaned);
    if (parsed.gt(0)) amount = parsed;
  }

  // Extract UPI ref
  let upiRef: string | null = null;
  const upiMatch = message.match(UPI_REF_REGEX);
  if (upiMatch?.[1]) upiRef = upiMatch[1];

  // Extract account number
  let accountNo: string | null = null;
  const accountMatch = message.match(ACCOUNT_REGEX);
  if (accountMatch?.[1]) accountNo = accountMatch[1];

  // Extract counterparty
  let counterparty: string | null = null;
  const counterpartyMatch = message.match(COUNTERPARTY_REGEX);
  if (counterpartyMatch?.[1]) counterparty = counterpartyMatch[1].trim();

  return {
    amount,
    upiRef,
    accountNo,
    bankName,
    txnType,
    counterparty,
    receivedAt: receivedAt ?? null,
  };
}

// ───────────────────────────────────────────────────────────
//  SMS INGESTION — store + dedup + match
// ───────────────────────────────────────────────────────────

export interface IngestSmsInput {
  companyId: string;
  sender: string;
  message: string;
  receivedAt?: Date;
  userId?: string;
}

export interface IngestSmsResult {
  id: string;
  status: string;
  amount: string | null;
  matchedEntityType: string | null;
  matchedEntityId: string | null;
  paymentRecordId: string | null;
  matchReason: string | null;
  duplicate: boolean;
}

function smsHash(sender: string, message: string, receivedAt: Date): string {
  return createHash("sha256")
    .update(`${sender}|${message}|${receivedAt.toISOString()}`)
    .digest("hex");
}

export async function ingestSms(input: IngestSmsInput): Promise<IngestSmsResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const hash = smsHash(input.sender, input.message, receivedAt);

  // Check for duplicate
  const existing = await prisma.bankSms.findUnique({ where: { smsHash: hash } });
  if (existing) {
    return {
      id: existing.id,
      status: existing.status,
      amount: existing.amount?.toString() ?? null,
      matchedEntityType: existing.matchedEntityType,
      matchedEntityId: existing.matchedEntityId,
      paymentRecordId: existing.paymentRecordId,
      matchReason: existing.matchReason,
      duplicate: true,
    };
  }

  // Parse the SMS
  const parsed = parseSms(input.sender, input.message, receivedAt);

  // Only process CREDIT transactions (money received)
  if (parsed.txnType !== "CREDIT" || !parsed.amount) {
    const sms = await prisma.bankSms.create({
      data: {
        companyId: input.companyId,
        sender: input.sender,
        message: input.message,
        receivedAt,
        amount: parsed.amount ?? null,
        upiRef: parsed.upiRef,
        accountNo: parsed.accountNo,
        bankName: parsed.bankName,
        txnType: parsed.txnType,
        counterparty: parsed.counterparty,
        status: parsed.txnType === "CREDIT" ? "UNMATCHED" : "IGNORED",
        matchReason: parsed.txnType !== "CREDIT" ? "Not a credit transaction" : "No amount detected",
        smsHash: hash,
      },
    });
    return {
      id: sms.id,
      status: sms.status,
      amount: sms.amount?.toString() ?? null,
      matchedEntityType: null,
      matchedEntityId: null,
      paymentRecordId: null,
      matchReason: sms.matchReason,
      duplicate: false,
    };
  }

  // Try to match the amount to an existing sale/tenancy
  const matchResult = await matchPayment(input.companyId, parsed.amount, parsed.counterparty);

  const sms = await prisma.bankSms.create({
    data: {
      companyId: input.companyId,
      sender: input.sender,
      message: input.message,
      receivedAt,
      amount: parsed.amount,
      upiRef: parsed.upiRef,
      accountNo: parsed.accountNo,
      bankName: parsed.bankName,
      txnType: parsed.txnType,
      counterparty: parsed.counterparty,
      status: matchResult.matched ? "MATCHED" : "UNMATCHED",
      matchedEntityType: matchResult.entityType,
      matchedEntityId: matchResult.entityId,
      paymentRecordId: matchResult.paymentId,
      matchConfidence: matchResult.confidence ? new Decimal(matchResult.confidence) : null,
      matchReason: matchResult.reason,
      smsHash: hash,
    },
  });

  if (input.userId) {
    await logAction(prisma, {
      userId: input.userId,
      action: "BANK_SMS_INGESTED",
      entityType: "BankSms",
      entityId: sms.id,
      after: {
        amount: parsed.amount.toString(),
        matched: matchResult.matched,
        entityType: matchResult.entityType,
        entityId: matchResult.entityId,
      },
    });
  }

  return {
    id: sms.id,
    status: sms.status,
    amount: sms.amount?.toString() ?? null,
    matchedEntityType: sms.matchedEntityType,
    matchedEntityId: sms.matchedEntityId,
    paymentRecordId: sms.paymentRecordId,
    matchReason: sms.matchReason,
    duplicate: false,
  };
}

// ───────────────────────────────────────────────────────────
//  MATCHING — find the sale/tenancy that matches the amount
// ───────────────────────────────────────────────────────────

interface MatchResult {
  matched: boolean;
  entityType: string | null;
  entityId: string | null;
  paymentId: string | null;
  confidence: number | null;
  reason: string;
}

async function matchPayment(
  companyId: string,
  amount: Decimal,
  counterparty: string | null,
): Promise<MatchResult> {
  // Strategy: look for outstanding payments that match the exact amount.
  // We check asset sales, material sales, and tenancies in order.
  // If counterparty name matches a customer/tenant name, boost confidence.

  // 1. Check asset sale payments — find sales with outstanding balance >= amount
  const assetSales = await prisma.assetSale.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
    },
    include: {
      customer: { select: { name: true, phone: true } },
      payments: { where: { status: "RECEIVED" }, select: { amount: true } },
    },
  });

  for (const sale of assetSales) {
    const totalPaid = sale.payments.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));
    const outstanding = new Decimal(sale.salePrice).plus(new Decimal(sale.gstAmount)).minus(totalPaid);
    // Match if the SMS amount equals the outstanding (exact match within 1 rupee)
    if (outstanding.minus(amount).abs().lt(1)) {
      // Exact match — high confidence
      const confidence = counterparty && sale.customer?.name?.toLowerCase().includes(counterparty.toLowerCase().split(" ")[0]!)
        ? 95
        : 80;
      // Create the payment + post GL + update parent status in one transaction
      const payment = await withSerializableTransaction(async (tx) => {
        const p = await tx.assetSalePayment.create({
          data: {
            assetSaleId: sale.id,
            amount,
            paymentDate: new Date(),
            mode: "BANK",
            status: "RECEIVED",
          },
        });
        // Post GL: Dr Cash, Cr Accounts Receivable (post-completion)
        //   or Dr Cash, Cr Customer Deposits (pre-completion).
        //   This mirrors the logic in sale.ts:recordPayment — pre-completion
        //   payments are deposits (revenue not yet recognised), post-completion
        //   payments settle the receivable.  Without this check, SMS-matched
        //   pre-completion payments would post to AR, and completeSale's
        //   deposit-settlement would find nothing to settle — causing a GL
        //   mismatch between the costing layer and the general ledger.
        const isCompleted = sale.saleStage === "COMPLETED";
        if (isCompleted) {
          await postPaymentReceived(tx, {
            companyId,
            assetSaleId: sale.id,
            paymentId: p.id,
            amount,
          });
        } else {
          await postDepositReceived(tx, {
            companyId,
            assetSaleId: sale.id,
            amount,
          });
        }
        // Recompute + update parent payment status
        const allPayments = await tx.assetSalePayment.findMany({
          where: { assetSaleId: sale.id, status: "RECEIVED" },
          select: { amount: true },
        });
        const newTotalPaid = allPayments.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));
        const totalDue = new Decimal(sale.salePrice).plus(new Decimal(sale.gstAmount));
        const newStatus = newTotalPaid.gte(totalDue) ? "PAID" : newTotalPaid.gt(0) ? "PARTIAL" : "PENDING";
        await tx.assetSale.update({
          where: { id: sale.id },
          data: { paymentStatus: newStatus },
        });
        return p;
      });
      // Emit notification (best-effort, outside tx)
      void emitNotificationEvent({
        eventType: NotificationEventType.SALE_PAYMENT_RECEIVED,
        companyId,
        entityType: "AssetSale",
        entityId: sale.id,
        variables: { amount: amount.toString(), saleNumber: sale.saleNumber },
        timestamp: new Date(),
      });
      return {
        matched: true,
        entityType: "ASSET_SALE",
        entityId: sale.id,
        paymentId: payment.id,
        confidence,
        reason: `Matched to asset sale ${sale.saleNumber} — exact outstanding amount`,
      };
    }
  }

  // 2. Check tenancy rent payments — find tenancies with due rent
  const tenancies = await prisma.tenancy.findMany({
    where: {
      companyId,
      status: "ACTIVE",
    },
    include: {
      customer: { select: { name: true } },
      payments: { where: { status: "RECEIVED" }, select: { amount: true } },
    },
  });

  for (const tenancy of tenancies) {
    // Check if the amount matches the monthly rent
    if (new Decimal(tenancy.monthlyRent).minus(amount).abs().lt(1)) {
      const confidence = counterparty && tenancy.tenantName.toLowerCase().includes(counterparty.toLowerCase().split(" ")[0]!)
        ? 90
        : 70;
      // Create the payment + post GL in one transaction
      const payment = await withSerializableTransaction(async (tx) => {
        const p = await tx.rentalPayment.create({
          data: {
            tenancyId: tenancy.id,
            amount,
            netReceived: amount,
            paymentDate: new Date(),
            dueDate: new Date(),
            mode: "BANK",
            status: "RECEIVED",
          },
        });
        // Post GL: Dr Cash, Cr Rent Revenue
        await postJournalEntry(tx, {
          companyId,
          sourceType: "RENT_PAYMENT",
          sourceId: p.id,
          memo: `Rent received from ${tenancy.tenantName} (bank SMS auto-match)`,
          lines: [
            { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "RentalPayment", entityId: p.id },
            { accountCode: ACCT.SALES_REVENUE, debit: 0, credit: amount, entityType: "Tenancy", entityId: tenancy.id },
          ],
        });
        return p;
      });
      return {
        matched: true,
        entityType: "TENANCY",
        entityId: tenancy.id,
        paymentId: payment.id,
        confidence,
        reason: `Matched to tenancy (${tenancy.tenantName}) — monthly rent amount`,
      };
    }
  }

  // 3. Check material sale payments
  const materialSales = await prisma.materialSale.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
    },
    include: {
      customer: { select: { name: true } },
      payments: { select: { amount: true } },
    },
  });

  for (const sale of materialSales) {
    const totalPaid = sale.payments.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));
    const outstanding = new Decimal(sale.totalAmount).minus(totalPaid);
    if (outstanding.minus(amount).abs().lt(1)) {
      const confidence = counterparty && sale.customer?.name?.toLowerCase().includes(counterparty.toLowerCase().split(" ")[0]!)
        ? 90
        : 75;
      // Create the payment + post GL + update parent status in one transaction
      const payment = await withSerializableTransaction(async (tx) => {
        const p = await tx.materialSalePayment.create({
          data: {
            saleId: sale.id,
            amount,
            paymentDate: new Date(),
            paymentMode: "BANK",
          },
        });
        // Post GL: Dr Cash, Cr Accounts Receivable
        await postMaterialSalePayment(tx, {
          companyId,
          materialSaleId: sale.id,
          paymentId: p.id,
          amount,
        });
        // Recompute + update parent payment status
        const allPayments = await tx.materialSalePayment.findMany({
          where: { saleId: sale.id },
          select: { amount: true },
        });
        const newTotalPaid = allPayments.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));
        const totalDue = new Decimal(sale.totalAmount);
        const newStatus = newTotalPaid.gte(totalDue) ? "PAID" : newTotalPaid.gt(0) ? "PARTIAL" : "PENDING";
        await tx.materialSale.update({
          where: { id: sale.id },
          data: { paymentStatus: newStatus },
        });
        return p;
      });
      return {
        matched: true,
        entityType: "MATERIAL_SALE",
        entityId: sale.id,
        paymentId: payment.id,
        confidence,
        reason: `Matched to material sale ${sale.saleNumber} — exact outstanding amount`,
      };
    }
  }

  // No match found
  return {
    matched: false,
    entityType: null,
    entityId: null,
    paymentId: null,
    confidence: null,
    reason: "No matching outstanding payment found for this amount",
  };
}

// ───────────────────────────────────────────────────────────
//  MANUAL MATCHING — let the user link an unmatched SMS
// ───────────────────────────────────────────────────────────

export interface ManualMatchInput {
  smsId: string;
  companyId: string;
  entityType: "ASSET_SALE" | "MATERIAL_SALE" | "TENANCY";
  entityId: string;
  userId?: string;
}

export async function manualMatchSms(input: ManualMatchInput) {
  const sms = await prisma.bankSms.findFirst({
    where: { id: input.smsId, companyId: input.companyId },
  });
  if (!sms) throw new ServiceError("SMS not found", 404);
  if (!sms.amount) throw new ServiceError("SMS has no parsed amount");
  if (sms.status === "MATCHED") throw new ServiceError("SMS is already matched");

  const amount = new Decimal(sms.amount);
  let paymentId: string | null = null;

  if (input.entityType === "ASSET_SALE") {
    paymentId = await withSerializableTransaction(async (tx) => {
      const sale = await tx.assetSale.findFirst({ where: { id: input.entityId, companyId: input.companyId } });
      if (!sale) throw new ServiceError("Asset sale not found", 404);
      const p = await tx.assetSalePayment.create({
        data: {
          assetSaleId: input.entityId,
          amount,
          paymentDate: new Date(),
          mode: "BANK",
          status: "RECEIVED",
          reference: sms.upiRef ?? undefined,
        },
      });
      // Post GL: same saleStage-aware routing as matchPayment above.
      // Pre-completion → Customer Deposits; post-completion → AR.
      const isCompleted = sale.saleStage === "COMPLETED";
      if (isCompleted) {
        await postPaymentReceived(tx, {
          companyId: input.companyId,
          assetSaleId: input.entityId,
          paymentId: p.id,
          amount,
        });
      } else {
        await postDepositReceived(tx, {
          companyId: input.companyId,
          assetSaleId: input.entityId,
          amount,
        });
      }
      // Recompute parent payment status
      const allPayments = await tx.assetSalePayment.findMany({
        where: { assetSaleId: input.entityId, status: "RECEIVED" },
        select: { amount: true },
      });
      const newTotalPaid = allPayments.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));
      const totalDue = new Decimal(sale.salePrice).plus(new Decimal(sale.gstAmount));
      const newStatus = newTotalPaid.gte(totalDue) ? "PAID" : newTotalPaid.gt(0) ? "PARTIAL" : "PENDING";
      await tx.assetSale.update({
        where: { id: input.entityId },
        data: { paymentStatus: newStatus },
      });
      return p.id;
    });
  } else if (input.entityType === "TENANCY") {
    paymentId = await withSerializableTransaction(async (tx) => {
      const tenancy = await tx.tenancy.findFirst({ where: { id: input.entityId, companyId: input.companyId } });
      if (!tenancy) throw new ServiceError("Tenancy not found", 404);
      const p = await tx.rentalPayment.create({
        data: {
          tenancyId: input.entityId,
          amount,
          netReceived: amount,
          paymentDate: new Date(),
          dueDate: new Date(),
          mode: "BANK",
          status: "RECEIVED",
          reference: sms.upiRef ?? undefined,
        },
      });
      await postJournalEntry(tx, {
        companyId: input.companyId,
        sourceType: "RENT_PAYMENT",
        sourceId: p.id,
        memo: `Rent received from ${tenancy.tenantName} (manual SMS match)`,
        lines: [
          { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "RentalPayment", entityId: p.id },
          { accountCode: ACCT.SALES_REVENUE, debit: 0, credit: amount, entityType: "Tenancy", entityId: input.entityId },
        ],
      });
      return p.id;
    });
  } else if (input.entityType === "MATERIAL_SALE") {
    paymentId = await withSerializableTransaction(async (tx) => {
      const sale = await tx.materialSale.findFirst({ where: { id: input.entityId, companyId: input.companyId } });
      if (!sale) throw new ServiceError("Material sale not found", 404);
      const p = await tx.materialSalePayment.create({
        data: {
          saleId: input.entityId,
          amount,
          paymentDate: new Date(),
          paymentMode: "BANK",
          referenceNo: sms.upiRef ?? undefined,
        },
      });
      await postMaterialSalePayment(tx, {
        companyId: input.companyId,
        materialSaleId: input.entityId,
        paymentId: p.id,
        amount,
      });
      // Recompute parent payment status
      const allPayments = await tx.materialSalePayment.findMany({
        where: { saleId: input.entityId },
        select: { amount: true },
      });
      const newTotalPaid = allPayments.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0));
      const totalDue = new Decimal(sale.totalAmount);
      const newStatus = newTotalPaid.gte(totalDue) ? "PAID" : newTotalPaid.gt(0) ? "PARTIAL" : "PENDING";
      await tx.materialSale.update({
        where: { id: input.entityId },
        data: { paymentStatus: newStatus },
      });
      return p.id;
    });
  }

  const updated = await prisma.bankSms.update({
    where: { id: sms.id },
    data: {
      status: "MATCHED",
      matchedEntityType: input.entityType,
      matchedEntityId: input.entityId,
      paymentRecordId: paymentId,
      matchConfidence: new Decimal(100),
      matchReason: "Manually matched by user",
    },
  });

  if (input.userId) {
    await logAction(prisma, {
      userId: input.userId,
      action: "BANK_SMS_MANUAL_MATCH",
      entityType: "BankSms",
      entityId: sms.id,
      after: { entityType: input.entityType, entityId: input.entityId },
    });
  }

  return updated;
}

// ───────────────────────────────────────────────────────────
//  BULK INGEST — process multiple SMS at once
// ───────────────────────────────────────────────────────────

export async function ingestSmsBatch(
  inputs: IngestSmsInput[],
): Promise<IngestSmsResult[]> {
  const results: IngestSmsResult[] = [];
  for (const input of inputs) {
    try {
      const result = await ingestSms(input);
      results.push(result);
    } catch (err) {
      results.push({
        id: "",
        status: "ERROR",
        amount: null,
        matchedEntityType: null,
        matchedEntityId: null,
        paymentRecordId: null,
        matchReason: err instanceof Error ? err.message : "Unknown error",
        duplicate: false,
      });
    }
  }
  return results;
}

// ───────────────────────────────────────────────────────────
//  STATS — for dashboard
// ───────────────────────────────────────────────────────────

export async function getSmsStats(companyId: string) {
  const [total, matched, unmatched, ignored, totalAmount] = await Promise.all([
    prisma.bankSms.count({ where: { companyId } }),
    prisma.bankSms.count({ where: { companyId, status: "MATCHED" } }),
    prisma.bankSms.count({ where: { companyId, status: "UNMATCHED" } }),
    prisma.bankSms.count({ where: { companyId, status: "IGNORED" } }),
    prisma.bankSms.aggregate({
      where: { companyId, status: "MATCHED", amount: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  return {
    total,
    matched,
    unmatched,
    ignored,
    totalMatchedAmount: totalAmount._sum.amount?.toString() ?? "0",
  };
}

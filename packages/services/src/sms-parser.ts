import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { createHash } from "crypto";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import {
  postPaymentReceived,
  postDepositReceived,
  postMaterialSalePayment,
  postJournalEntry,
  ACCT,
} from "./gl-posting";
import {
  emitNotificationEvent,
  NotificationEventType,
} from "./notification-event-bus";
import { withSerializableTransaction } from "./transaction";
import { syncPaymentScheduleFromPayments, sumClearedAssetSalePayments } from "./sale";
import { sendNotification } from "./notifications";
import { computeLateInterest } from "./collections";

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
const UPI_REF_REGEX =
  /(?:UPI\s*Ref(?:\.|No|Number)?)?\s*[:#]?\s*([0-9]{10,22})/i;

// Account number extraction — "a/c XX1234", "account xxx1234", "a/c no 1234"
const ACCOUNT_REGEX =
  /(?:a\/c(?:\s*no)?|account)\s*(?:no\.?\s*)?(?:[Xx]+)?([0-9]{3,8})/i;

// Transaction type detection
function detectTxnType(message: string): "CREDIT" | "DEBIT" | "REFUND" | null {
  const lower = message.toLowerCase();
  if (lower.includes("refund")) return "REFUND";
  // Check DEBIT before CREDIT — a debit alert frequently contains the word
  // "credit" ("your Credit Card ending 1234 has been debited") and must not
  // be read as money received; a false-positive credit can auto-post phantom
  // revenue when the amount happens to match an outstanding balance.
  if (
    lower.includes("debited") ||
    lower.includes("withdrawn") ||
    lower.includes("spent") ||
    lower.includes("debit")
  )
    return "DEBIT";
  if (
    lower.includes("credited") ||
    lower.includes("received") ||
    lower.includes("deposited") ||
    lower.includes("credit")
  )
    return "CREDIT";
  return null;
}

// Counterparty extraction — "from JOHN DOE", "by RAMESH KUMAR"
const COUNTERPARTY_REGEX = /(?:from|by)\s+([A-Z][A-Z\s]{3,30})/;

export function parseSms(
  sender: string,
  message: string,
  receivedAt?: Date,
): ParsedSms {
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

/**
 * Dedup identity = the SMS *content* (sender + message text), NOT the arrival
 * timestamp. Bank SMS embed the transaction ref + value date in the message
 * body, so byte-identical messages are the same transaction. Hashing
 * `receivedAt` (our ingestion time) meant the same forwarded SMS arriving
 * twice produced different hashes → double-posted payments.
 */
function smsHash(sender: string, message: string): string {
  return createHash("sha256").update(`${sender}|${message}`).digest("hex");
}

export async function ingestSms(
  input: IngestSmsInput,
): Promise<IngestSmsResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const hash = smsHash(input.sender, input.message);

  // Fast-path duplicate check — the common case is a forwarded SMS arriving
  // later, not a race.
  const existing = await prisma.bankSms.findUnique({
    where: { smsHash: hash },
  });
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
  const isCredit = parsed.txnType === "CREDIT" && !!parsed.amount;

  // Claim the hash BEFORE any money moves. Previously the payment+GL commit
  // ran inside matchPayment and the BankSms row was created after — two
  // concurrent ingests of the same message both posted payments before one
  // lost the unique-hash race. Creating the row first makes the hash the
  // claim: the loser gets P2002 and returns the winner's result.
  let sms;
  try {
    sms = await prisma.bankSms.create({
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
        status: isCredit
          ? "MATCHING"
          : parsed.txnType === "CREDIT"
            ? "UNMATCHED"
            : "IGNORED",
        matchReason: isCredit
          ? null
          : parsed.txnType !== "CREDIT"
            ? "Not a credit transaction"
            : "No amount detected",
        smsHash: hash,
      },
    });
  } catch (err) {
    // Unique-hash collision — the winner's ingest is already recorded (or in
    // flight); re-read it and report the duplicate.
    const won = await prisma.bankSms.findUnique({ where: { smsHash: hash } });
    if (won) {
      return {
        id: won.id,
        status: won.status,
        amount: won.amount?.toString() ?? null,
        matchedEntityType: won.matchedEntityType,
        matchedEntityId: won.matchedEntityId,
        paymentRecordId: won.paymentRecordId,
        matchReason: won.matchReason,
        duplicate: true,
      };
    }
    throw err;
  }

  if (!isCredit) {
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

  // Try to match the amount to an existing sale/tenancy. A matcher failure
  // leaves the row UNMATCHED (retryable via manual match) — the SMS itself
  // is safely recorded either way.
  let matchResult: MatchResult;
  try {
    matchResult = await matchPayment(
      input.companyId,
      parsed.amount!,
      parsed.counterparty,
    );
  } catch (err) {
    await prisma.bankSms.update({
      where: { id: sms.id },
      data: {
        status: "UNMATCHED",
        matchReason: `Auto-match failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    });
    throw err;
  }

  sms = await prisma.bankSms.update({
    where: { id: sms.id },
    data: {
      status: matchResult.matched ? "MATCHED" : "UNMATCHED",
      matchedEntityType: matchResult.entityType,
      matchedEntityId: matchResult.entityId,
      paymentRecordId: matchResult.paymentId,
      matchConfidence: matchResult.confidence
        ? new Decimal(matchResult.confidence)
        : null,
      matchReason: matchResult.reason,
    },
  });

  if (input.userId) {
    await logAction(prisma, {
      userId: input.userId,
      action: "BANK_SMS_INGESTED",
      entityType: "BankSms",
      entityId: sms.id,
      after: {
        amount: parsed.amount!.toString(),
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

export async function matchPayment(
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
      // Outstanding counts realised money only — voided rows, PENDING and
      // BOUNCED cheques are not cash-in-hand.
      payments: { select: { amount: true, status: true, chequeStatus: true } },
    },
  });

  // Collect every sale whose outstanding equals the SMS amount, then only
  // auto-match if it's UNAMBIGUOUS — two open sales with the same outstanding
  // (e.g. two identical ₹5L flat bookings) would otherwise cross-match to
  // whichever the DB returned first. Same ambiguity guard the installment
  // matcher below uses.
  const exactMatches = assetSales.filter((sale) => {
    const totalPaid = sumClearedAssetSalePayments(sale.payments);
    const outstanding = new Decimal(sale.salePrice)
      .plus(new Decimal(sale.gstAmount))
      .minus(totalPaid);
    return outstanding.minus(amount).abs().lt(1);
  });

  if (exactMatches.length === 1) {
    const sale = exactMatches[0]!;
    // Exact match — high confidence
    const confidence =
      counterparty &&
      sale.customer?.name
        ?.toLowerCase()
        .includes(counterparty.toLowerCase().split(" ")[0]!)
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
      // Sync payment schedule items with actual payment totals
      await syncPaymentScheduleFromPayments(tx, sale.id);
      // Recompute + update parent payment status — cleared payments only,
      // same rule the schedule sync uses.
      const allPayments = await tx.assetSalePayment.findMany({
        where: { assetSaleId: sale.id, status: { not: "VOID" } },
        select: { amount: true, status: true, chequeStatus: true },
      });
      const newTotalPaid = sumClearedAssetSalePayments(allPayments);
      const totalDue = new Decimal(sale.salePrice).plus(
        new Decimal(sale.gstAmount),
      );
      const newStatus = newTotalPaid.gte(totalDue)
        ? "PAID"
        : newTotalPaid.gt(0)
          ? "PARTIAL"
          : "PENDING";
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

  // 1b. Installment-level match — buyers commonly pay ONE installment
  //     (e.g. ₹10L of a ₹30L sale), not the whole outstanding. If the SMS
  //     amount uniquely equals a single unpaid schedule item across all
  //     active sales, record it against that sale. Ambiguous (multiple
  //     installments share the amount) → skip, leave for manual review.
  const dueInstallments = await prisma.paymentScheduleItem.findMany({
    where: {
      status: { in: ["PENDING", "DUE", "PARTIAL"] },
      paymentSchedule: {
        assetSale: {
          companyId,
          status: "ACTIVE",
          paymentStatus: { in: ["PENDING", "PARTIAL"] },
        },
      },
    },
    select: {
      id: true,
      installmentNo: true,
      totalAmount: true,
      dueDate: true,
      paidAmount: true,
      paymentSchedule: {
        select: {
          assetSaleId: true,
          assetSale: {
            select: {
              id: true,
              saleNumber: true,
              saleStage: true,
              customer: { select: { name: true, phone: true } },
            },
          },
        },
      },
    },
  });
  const installMatches = dueInstallments.filter((i) =>
    new Decimal(i.totalAmount).minus(amount).abs().lt(1),
  );
  const distinctSales = [
    ...new Set(installMatches.map((i) => i.paymentSchedule.assetSaleId)),
  ];
  if (installMatches.length >= 1 && distinctSales.length === 1) {
    const saleId = distinctSales[0]!;
    const sale = await prisma.assetSale.findFirst({
      where: { id: saleId, companyId },
      include: { customer: { select: { name: true } } },
    });
    if (sale) {
      const item = installMatches[0]!;
      const confidence =
        counterparty &&
        sale.customer?.name
          ?.toLowerCase()
          .includes(counterparty.toLowerCase().split(" ")[0]!)
          ? 92
          : 78;
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
        if (sale.saleStage === "COMPLETED") {
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
        await syncPaymentScheduleFromPayments(tx, sale.id);
        const allPayments = await tx.assetSalePayment.findMany({
          where: { assetSaleId: sale.id, status: { not: "VOID" } },
          select: { amount: true, status: true, chequeStatus: true },
        });
        const newTotalPaid = sumClearedAssetSalePayments(allPayments);
        const totalDue = new Decimal(sale.salePrice).plus(
          new Decimal(sale.gstAmount),
        );
        const newStatus = newTotalPaid.gte(totalDue)
          ? "PAID"
          : newTotalPaid.gt(0)
            ? "PARTIAL"
            : "PENDING";
        await tx.assetSale.update({
          where: { id: sale.id },
          data: { paymentStatus: newStatus },
        });
        return p;
      });
      void emitNotificationEvent({
        eventType: NotificationEventType.SALE_PAYMENT_RECEIVED,
        companyId,
        entityType: "AssetSale",
        entityId: sale.id,
        variables: { amount: amount.toString(), saleNumber: sale.saleNumber },
        timestamp: new Date(),
      });
      // Exact-amount match on an overdue installment silently forgives the
      // accrued interest — flag the residual to staff so it's waived or
      // collected, never vanished.
      const accrued = item.dueDate
        ? Number(computeLateInterest({ totalAmount: item.totalAmount, paidAmount: item.paidAmount, dueDate: item.dueDate })?.interest ?? 0)
        : 0;
      if (accrued > 0) {
        void sendNotification({
          companyId,
          eventType: "INTEREST_REMAINDER",
          channel: "IN_APP",
          recipient: companyId,
          recipientName: "Collections",
          message: `SMS-matched payment of ₹${amount} cleared installment #${item.installmentNo} on ${sale.saleNumber}, but ₹${Math.round(accrued * 100) / 100} accrued late interest was left uncollected — collect or formally waive it.`,
          metadata: { saleId: sale.id, scheduleItemId: item.id, residualInterest: accrued },
        }).catch(() => {});
      }
      // Buyer acknowledgment — an auto-matched payment deserves the same
      // receipt the manual-payment path sends.
      const custPhone = item.paymentSchedule.assetSale.customer?.phone ?? null;
      const custName = item.paymentSchedule.assetSale.customer?.name ?? "Customer";
      if (custPhone) {
        void sendNotification({
          companyId,
          eventType: "PAYMENT_RECEIVED",
          channel: "WHATSAPP",
          recipient: custPhone,
          recipientName: custName,
          message: `✅ *Payment Received*\n\nDear ${custName},\n\nWe have received your payment of ₹${amount} for ${sale.saleNumber} (installment #${item.installmentNo}).\n\nThank you for your business!`,
          metadata: { saleId: sale.id, scheduleItemId: item.id, amount: amount.toString(), source: "SMS_AUTO_MATCH" },
        }).catch(() => {});
      }
      return {
        matched: true,
        entityType: "ASSET_SALE",
        entityId: sale.id,
        paymentId: payment.id,
        confidence,
        reason: `Matched to asset sale ${sale.saleNumber} — installment ${item.installmentNo} amount`,
      };
    }
  }

  // 2. Check tenancy rent payments — find tenancies with due rent.
  //    Same uniqueness rule as sales: two units at the same monthly rent are
  //    common, and a first-row match would credit a random tenant's ledger.
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

  const rentMatches = tenancies.filter((t) =>
    new Decimal(t.monthlyRent).minus(amount).abs().lt(1),
  );
  if (rentMatches.length === 1) {
    const tenancy = rentMatches[0]!;
    const confidence =
      counterparty &&
      tenancy.tenantName
        .toLowerCase()
        .includes(counterparty.toLowerCase().split(" ")[0]!)
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
          {
            accountCode: ACCT.CASH,
            debit: amount,
            credit: 0,
            entityType: "RentalPayment",
            entityId: p.id,
          },
          {
            accountCode: ACCT.SALES_REVENUE,
            debit: 0,
            credit: amount,
            entityType: "Tenancy",
            entityId: tenancy.id,
          },
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

  // 3. Check material sale payments — unique outstanding match only, and
  //    outstanding counts realised money only (VOID rows, OUT refunds and
  //    BOUNCED cheques excluded — the canonical sale-payment sum rule).
  const materialSales = await prisma.materialSale.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
    },
    include: {
      customer: { select: { name: true } },
      payments: {
        where: {
          status: { not: "VOID" },
          direction: "IN",
          OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }],
        },
        select: { amount: true },
      },
    },
  });

  const msMatches = materialSales.filter((sale) => {
    const totalPaid = sale.payments.reduce(
      (s, p) => s.plus(new Decimal(p.amount)),
      new Decimal(0),
    );
    const outstanding = new Decimal(sale.totalAmount).minus(totalPaid);
    return outstanding.minus(amount).abs().lt(1);
  });
  if (msMatches.length === 1) {
    const sale = msMatches[0]!;
    const confidence =
      counterparty &&
      sale.customer?.name
        ?.toLowerCase()
        .includes(counterparty.toLowerCase().split(" ")[0]!)
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
      // Recompute + update parent payment status — realised payments only
      const allPayments = await tx.materialSalePayment.findMany({
        where: {
          saleId: sale.id,
          status: { not: "VOID" },
          direction: "IN",
          OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }],
        },
        select: { amount: true },
      });
      const newTotalPaid = allPayments.reduce(
        (s, p) => s.plus(new Decimal(p.amount)),
        new Decimal(0),
      );
      const totalDue = new Decimal(sale.totalAmount);
      const newStatus = newTotalPaid.gte(totalDue)
        ? "PAID"
        : newTotalPaid.gt(0)
          ? "PARTIAL"
          : "PENDING";
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
  if (sms.status === "MATCHED")
    throw new ServiceError("SMS is already matched");

  const amount = new Decimal(sms.amount);
  let updated;

  // Each branch runs as ONE serializable tx: claim the SMS (refuse a
  // concurrent second match before any money moves), validate the target,
  // post the payment + GL, then write the matched state back — atomic.
  if (input.entityType === "ASSET_SALE") {
    updated = await withSerializableTransaction(async (tx) => {
      const claim = await tx.bankSms.updateMany({
        where: { id: sms.id, status: { not: "MATCHED" } },
        data: {
          status: "MATCHED",
          matchedEntityType: input.entityType,
          matchedEntityId: input.entityId,
          matchConfidence: new Decimal(100),
          matchReason: "Manually matched by user",
        },
      });
      if (claim.count === 0) throw new ServiceError("SMS is already matched", 409);
      const sale = await tx.assetSale.findFirst({
        where: { id: input.entityId, companyId: input.companyId },
      });
      if (!sale) throw new ServiceError("Asset sale not found", 404);
      // Money into dead books: a cancelled sale's payment would sit
      // unreconciled forever, and a fully-paid sale's excess belongs in the
      // customer's credit balance, not an unmatched payment row.
      if (sale.status === "CANCELLED") throw new ServiceError("Cannot apply a payment to a cancelled sale — refund the payer instead", 400);
      if (sale.paymentStatus === "PAID") throw new ServiceError("Sale is already fully paid — record this as customer credit from the sale's payments view instead", 400);
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
      // Sync payment schedule items with actual payment totals
      await syncPaymentScheduleFromPayments(tx, input.entityId);
      // Recompute parent payment status — realised payments only
      const allPayments = await tx.assetSalePayment.findMany({
        where: { assetSaleId: input.entityId, status: { not: "VOID" } },
        select: { amount: true, status: true, chequeStatus: true },
      });
      const newTotalPaid = sumClearedAssetSalePayments(allPayments);
      const totalDue = new Decimal(sale.salePrice).plus(
        new Decimal(sale.gstAmount),
      );
      const newStatus = newTotalPaid.gte(totalDue)
        ? "PAID"
        : newTotalPaid.gt(0)
          ? "PARTIAL"
          : "PENDING";
      await tx.assetSale.update({
        where: { id: input.entityId },
        data: { paymentStatus: newStatus },
      });
      await tx.bankSms.update({
        where: { id: sms.id },
        data: { paymentRecordId: p.id },
      });
      return tx.bankSms.findUniqueOrThrow({ where: { id: sms.id } });
    });
  } else if (input.entityType === "TENANCY") {
    updated = await withSerializableTransaction(async (tx) => {
      const claim = await tx.bankSms.updateMany({
        where: { id: sms.id, status: { not: "MATCHED" } },
        data: {
          status: "MATCHED",
          matchedEntityType: input.entityType,
          matchedEntityId: input.entityId,
          matchConfidence: new Decimal(100),
          matchReason: "Manually matched by user",
        },
      });
      if (claim.count === 0) throw new ServiceError("SMS is already matched", 409);
      const tenancy = await tx.tenancy.findFirst({
        where: { id: input.entityId, companyId: input.companyId },
      });
      if (!tenancy) throw new ServiceError("Tenancy not found", 404);
      if (tenancy.status !== "ACTIVE") {
        throw new ServiceError(`Cannot apply rent to a ${tenancy.status.toLowerCase()} tenancy`, 400);
      }
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
          {
            accountCode: ACCT.CASH,
            debit: amount,
            credit: 0,
            entityType: "RentalPayment",
            entityId: p.id,
          },
          {
            accountCode: ACCT.SALES_REVENUE,
            debit: 0,
            credit: amount,
            entityType: "Tenancy",
            entityId: input.entityId,
          },
        ],
      });
      await tx.bankSms.update({
        where: { id: sms.id },
        data: { paymentRecordId: p.id },
      });
      return tx.bankSms.findUniqueOrThrow({ where: { id: sms.id } });
    });
  } else if (input.entityType === "MATERIAL_SALE") {
    updated = await withSerializableTransaction(async (tx) => {
      const claim = await tx.bankSms.updateMany({
        where: { id: sms.id, status: { not: "MATCHED" } },
        data: {
          status: "MATCHED",
          matchedEntityType: input.entityType,
          matchedEntityId: input.entityId,
          matchConfidence: new Decimal(100),
          matchReason: "Manually matched by user",
        },
      });
      if (claim.count === 0) throw new ServiceError("SMS is already matched", 409);
      const sale = await tx.materialSale.findFirst({
        where: { id: input.entityId, companyId: input.companyId },
      });
      if (!sale) throw new ServiceError("Material sale not found", 404);
      if (sale.status === "CANCELLED") throw new ServiceError("Cannot apply a payment to a cancelled sale — refund the payer instead", 400);
      if (sale.paymentStatus === "PAID") throw new ServiceError("Sale is already fully paid — record this as customer credit from the sale's payments view instead", 400);
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
      // Recompute parent payment status — realised payments only
      const allPayments = await tx.materialSalePayment.findMany({
        where: {
          saleId: input.entityId,
          status: { not: "VOID" },
          direction: "IN",
          OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }],
        },
        select: { amount: true },
      });
      const newTotalPaid = allPayments.reduce(
        (s, p) => s.plus(new Decimal(p.amount)),
        new Decimal(0),
      );
      const totalDue = new Decimal(sale.totalAmount);
      const newStatus = newTotalPaid.gte(totalDue)
        ? "PAID"
        : newTotalPaid.gt(0)
          ? "PARTIAL"
          : "PENDING";
      await tx.materialSale.update({
        where: { id: input.entityId },
        data: { paymentStatus: newStatus },
      });
      await tx.bankSms.update({
        where: { id: sms.id },
        data: { paymentRecordId: p.id },
      });
      return tx.bankSms.findUniqueOrThrow({ where: { id: sms.id } });
    });
  } else {
    throw new ServiceError(`Unknown entity type: ${input.entityType}`, 400);
  }

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

// ───────────────────────────────────────────────────────────
//  IGNORE — dismiss an SMS that is not a receivable payment
// ───────────────────────────────────────────────────────────

export async function ignoreSms(input: {
  smsId: string;
  companyId: string;
  userId?: string;
}) {
  const sms = await prisma.bankSms.findFirst({
    where: { id: input.smsId, companyId: input.companyId },
  });
  if (!sms) throw new ServiceError("SMS not found", 404);
  if (sms.status === "MATCHED")
    throw new ServiceError("SMS is already matched — void the payment from the sale/tenancy instead", 400);

  const updated = await prisma.bankSms.update({
    where: { id: sms.id },
    data: { status: "IGNORED", matchReason: "Dismissed by user" },
  });

  if (input.userId) {
    await logAction(prisma, {
      userId: input.userId,
      action: "BANK_SMS_IGNORED",
      entityType: "BankSms",
      entityId: sms.id,
      before: { status: sms.status },
      after: { status: "IGNORED" },
    });
  }

  return updated;
}

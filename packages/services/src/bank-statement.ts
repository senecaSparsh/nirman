import { createHash } from "crypto";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";

/**
 * Bank/CC statement import — the monthly reconciliation workflow. A CSV or
 * TSV from the bank portal becomes BankSms rows (the reconciliation entity)
 * so every existing primitive — amount-matching, manual match, GL posting,
 * the SMS review page — works on statement lines with zero duplication.
 *
 * Rows are synthesized as canonical "message" strings the parser/matcher
 * understands; the sender marks the source as the statement file.
 */

export interface StatementRow {
  /** Transaction date — parsed by the API layer from any sane format. */
  date: Date;
  /** Narration/description as it appears on the statement. */
  narration: string;
  /** Cheque/UTR/UPI ref number, if the statement carries one. */
  refNo?: string | null;
  /** Signed amount; credits positive for collection matching. */
  credit?: Decimal | number | string | null;
  debit?: Decimal | number | string | null;
}

/**
 * Import one statement file's parsed rows. Dedupes on the shared smsHash —
 * re-importing the same file skips identical lines. Returns counts.
 */
export async function importBankStatement(input: {
  companyId: string;
  fileName: string;
  rows: StatementRow[];
  userId?: string;
}) {
  const sender = `STMT-${input.fileName.slice(0, 24).replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "FILE"}`;
  let created = 0, credits = 0, matched = 0, deduped = 0;

  const { matchPayment } = await import("./sms-parser");

  for (const row of input.rows) {
    const credit = row.credit ? new Decimal(row.credit) : new Decimal(0);
    const debit = row.debit ? new Decimal(row.debit) : new Decimal(0);
    if (credit.lte(0) && debit.lte(0)) continue;
    const isCredit = credit.gt(0);
    const amount = isCredit ? credit : debit;

    // Canonical message — carries ref + amount so the hash + matcher see
    // exactly what a real SMS would carry.
    const message = `${isCredit ? "CR" : "DR"} ${amount.toFixed(2)} | ${row.narration.slice(0, 180)}${row.refNo ? ` | ref ${row.refNo}` : ""}`;
    const hash = createHash("sha256")
      .update(`${sender}|${message}|${row.date.toISOString().slice(0, 10)}`)
      .digest("hex");

    const existing = await prisma.bankSms.findUnique({ where: { smsHash: hash } });
    if (existing) { deduped++; continue; }

    const sms = await prisma.bankSms.create({
      data: {
        companyId: input.companyId,
        sender,
        message,
        receivedAt: row.date,
        amount,
        upiRef: row.refNo ?? null,
        txnType: isCredit ? "CREDIT" : "DEBIT",
        counterparty: row.narration.slice(0, 120),
        status: isCredit ? "MATCHING" : "IGNORED",
        matchReason: isCredit ? null : "Not a credit transaction",
        smsHash: hash,
      },
    });
    created++;
    if (!isCredit) continue;
    credits++;

    try {
      const matchResult = await matchPayment(input.companyId, amount, row.narration.slice(0, 120));
      if (matchResult.matched) {
        matched++;
        await prisma.bankSms.update({
          where: { id: sms.id },
          data: {
            status: "MATCHED",
            matchedEntityType: matchResult.entityType,
            matchedEntityId: matchResult.entityId,
            paymentRecordId: matchResult.paymentId,
            matchConfidence: matchResult.confidence ? new Decimal(matchResult.confidence) : null,
            matchReason: matchResult.reason,
          },
        });
      } else {
        await prisma.bankSms.update({
          where: { id: sms.id },
          data: { status: "UNMATCHED", matchReason: matchResult.reason },
        });
      }
    } catch {
      await prisma.bankSms.update({
        where: { id: sms.id },
        data: { status: "UNMATCHED", matchReason: "Matcher error — retry via manual match" },
      });
    }
  }

  return { created, credits, matched, deduped, skipped: input.rows.length - created - deduped };
}

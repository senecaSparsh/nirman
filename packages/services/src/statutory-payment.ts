// ─────────────────────────────────────────────────────────────────────────
//  STATUTORY PAYMENTS — remit statutory liabilities to the authorities.
//
//  Payroll credits PF (2250)/ESI (2350) payable every period; supplier
//  payments credit TDS (2400); sales/credit notes move output GST (2100)
//  while purchases/expenses accumulate ITC (1400). Without a remittance
//  path those payables grow forever — the books carry liabilities that in
//  reality were paid to EPFO/ESIC/the tax department months ago.
//
//  recordStatutoryPayment settles them:
//    PF / ESI / TDS :  Dr <payable> / Cr Cash — amount ≤ balance
//    GST            :  Dr Output GST (cash + ITC utilized)
//                      Cr Cash (the challan amount) / Cr Input GST (ITC leg)
//                      — ITC utilization is capped at min(ITC balance,
//                      output balance); cash can never exceed net due.
//
//  Void reverses the JE and marks the row VOID — the payable re-opens.
// ─────────────────────────────────────────────────────────────────────────

import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { withSerializableTransaction } from "./transaction";
import { postJournalEntry, reverseJournalEntry, ACCT } from "./gl-posting";
import { ServiceError } from "./errors";
import { logAction } from "./audit";

export const STATUTORY_KINDS = ["PF", "ESI", "PT", "TDS", "GST", "TDS_REFUND"] as const;
export type StatutoryKind = (typeof STATUTORY_KINDS)[number];

const KIND_ACCOUNT: Record<Exclude<StatutoryKind, "GST" | "TDS_REFUND">, string> = {
  PF: ACCT.PF_PAYABLE,
  ESI: ACCT.ESI_PAYABLE,
  PT: ACCT.PROFESSION_TAX_PAYABLE,
  TDS: ACCT.TDS_PAYABLE,
};

/** Credit-normal balance of an account: Σcredit − Σdebit on POSTED JEs. */
async function accountBalance(tx: Prisma.TransactionClient | typeof prisma, companyId: string, code: string): Promise<Decimal> {
  const r = await tx.journalLine.aggregate({
    where: {
      account: { companyId, code },
      journalEntry: { companyId, status: "POSTED" },
    },
    _sum: { debit: true, credit: true },
  });
  return new Decimal(r._sum.credit ?? 0).minus(new Decimal(r._sum.debit ?? 0));
}

/**
 * What the company still owes for a statutory kind.
 *  PF/ESI/TDS → the payable's credit balance.
 *  GST → output-GST balance minus ITC balance (net liability). The ITC
 *        portion settles by offset, not cash.
 */
export async function statutoryOutstanding(companyId: string, kind: StatutoryKind): Promise<{ outstanding: Decimal; itcAvailable?: Decimal; outputGst?: Decimal }> {
  if (kind === "GST") {
    const output = await accountBalance(prisma, companyId, ACCT.OUTPUT_GST);
    const itc = (await accountBalance(prisma, companyId, ACCT.INPUT_GST)).neg(); // 1400 is debit-normal
    return { outstanding: Decimal.max(0, output.minus(itc)), itcAvailable: Decimal.max(0, itc), outputGst: Decimal.max(0, output) };
  }
  if (kind === "TDS_REFUND") {
    // TDS receivable (1960) is debit-normal — the claimable balance.
    const rent = Decimal.max(0, (await accountBalance(prisma, companyId, ACCT.TDS_RECEIVABLE)).neg());
    const sales = Decimal.max(0, (await accountBalance(prisma, companyId, ACCT.TDS_RECEIVABLE_SALES)).neg());
    return { outstanding: rent.plus(sales) };
  }
  return { outstanding: Decimal.max(0, await accountBalance(prisma, companyId, KIND_ACCOUNT[kind])) };
}

export async function recordStatutoryPayment(input: {
  companyId: string;
  kind: StatutoryKind;
  /** Cash paid. For GST this is the challan amount (net of ITC offset). */
  amount: Decimal | number | string;
  paymentDate?: Date | string;
  period?: string;      // "YYYY-MM" challan period
  referenceNo?: string; // challan / UTR
  notes?: string;
  userId?: string;
}) {
  if (!STATUTORY_KINDS.includes(input.kind)) {
    throw new ServiceError(`Unknown statutory kind — expected one of ${STATUTORY_KINDS.join(", ")}`, 400);
  }
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Amount must be greater than zero", 400);

  return withSerializableTransaction(async (tx) => {
    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    const lines: { accountCode: string; debit: Decimal; credit: Decimal; entityType: string; entityId?: string; memo: string }[] = [];
    let itcUtilized = new Decimal(0);

    if (input.kind === "GST") {
      const output = await accountBalance(tx, input.companyId, ACCT.OUTPUT_GST);
      const itcBalance = (await accountBalance(tx, input.companyId, ACCT.INPUT_GST)).neg();
      const netDue = Decimal.max(0, output.minus(Decimal.max(0, itcBalance)));
      if (amount.gt(netDue)) {
        throw new ServiceError(`Payment ${amount} exceeds net GST liability of ${netDue} (output ${output} − ITC ${Decimal.max(0, itcBalance)})`, 400);
      }
      // Utilize ITC to offset output tax — the offset drains both accounts.
      itcUtilized = Decimal.min(Decimal.max(0, itcBalance), output);
      lines.push(
        { accountCode: ACCT.OUTPUT_GST, debit: amount.plus(itcUtilized), credit: new Decimal(0), entityType: "StatutoryPayment", memo: "Output GST settled" },
        { accountCode: ACCT.CASH, debit: new Decimal(0), credit: amount, entityType: "StatutoryPayment", memo: "GST challan paid" },
      );
      if (itcUtilized.gt(0)) {
        lines.push({ accountCode: ACCT.INPUT_GST, debit: new Decimal(0), credit: itcUtilized, entityType: "StatutoryPayment", memo: "ITC utilized against output tax" });
      }
    } else if (input.kind === "TDS_REFUND") {
      // TDS deducted by buyers/tenants (Dr 1960 + 1961) is recovered when
      // the refund lands in cash — relieve rent-TDS first, then sales-TDS.
      const rec1960 = Decimal.max(0, (await accountBalance(tx, input.companyId, ACCT.TDS_RECEIVABLE)).neg());
      const rec1961 = Decimal.max(0, (await accountBalance(tx, input.companyId, ACCT.TDS_RECEIVABLE_SALES)).neg());
      const receivable = rec1960.plus(rec1961);
      if (amount.gt(receivable)) {
        throw new ServiceError(`Refund ${amount} exceeds the TDS receivable balance of ${receivable}`, 400);
      }
      const from1960 = Decimal.min(amount, rec1960);
      const from1961 = amount.minus(from1960);
      lines.push({ accountCode: ACCT.CASH, debit: amount, credit: new Decimal(0), entityType: "StatutoryPayment", memo: "TDS refund received" });
      if (from1960.gt(0)) {
        lines.push({ accountCode: ACCT.TDS_RECEIVABLE, debit: new Decimal(0), credit: from1960, entityType: "StatutoryPayment", memo: "TDS receivable relieved (rent)" });
      }
      if (from1961.gt(0)) {
        lines.push({ accountCode: ACCT.TDS_RECEIVABLE_SALES, debit: new Decimal(0), credit: from1961, entityType: "StatutoryPayment", memo: "TDS receivable relieved (sales)" });
      }
    } else {
      const acct = KIND_ACCOUNT[input.kind];
      const due = await accountBalance(tx, input.companyId, acct);
      if (amount.gt(due)) {
        throw new ServiceError(`Payment ${amount} exceeds outstanding ${input.kind} liability of ${due}`, 400);
      }
      lines.push(
        { accountCode: acct, debit: amount, credit: new Decimal(0), entityType: "StatutoryPayment", memo: `${input.kind} liability settled` },
        { accountCode: ACCT.CASH, debit: new Decimal(0), credit: amount, entityType: "StatutoryPayment", memo: `${input.kind} remittance` },
      );
    }

    const row = await tx.statutoryPayment.create({
      data: {
        companyId: input.companyId,
        kind: input.kind,
        amount,
        itcUtilized,
        period: input.period ?? null,
        paymentDate,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });
    for (const l of lines) l.entityId = row.id;

    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "STATUTORY_PAYMENT",
      sourceId: row.id,
      entryDate: paymentDate,
      memo: `${input.kind} statutory payment${input.period ? ` (${input.period})` : ""}${input.referenceNo ? ` — ${input.referenceNo}` : ""}`,
      postedById: input.userId,
      lines,
    });

    await logAction(tx, {
      userId: input.userId,
      action: "STATUTORY_PAYMENT",
      entityType: "StatutoryPayment",
      entityId: row.id,
      after: { kind: input.kind, amount: amount.toString(), itcUtilized: itcUtilized.toString(), period: input.period ?? null },
    });
    return row;
  });
}

export async function voidStatutoryPayment(input: { paymentId: string; companyId?: string; userId?: string; reason?: string }) {
  return withSerializableTransaction(async (tx) => {
    const row = await tx.statutoryPayment.findUnique({ where: { id: input.paymentId } });
    if (!row) throw new ServiceError("Statutory payment not found", 404);
    if (input.companyId && row.companyId !== input.companyId) throw new ServiceError("Statutory payment not found", 404);
    if (row.status === "VOID") throw new ServiceError("Already voided", 409);

    const je = await tx.journalEntry.findFirst({
      where: { sourceType: "STATUTORY_PAYMENT", sourceId: row.id, status: "POSTED" },
      select: { id: true },
    });
    if (je) {
      await reverseJournalEntry(tx, je.id, { postedById: input.userId, memo: `Statutory payment voided${input.reason ? `: ${input.reason}` : ""}` });
    }
    const updated = await tx.statutoryPayment.update({ where: { id: row.id }, data: { status: "VOID" } });
    await logAction(tx, {
      userId: input.userId,
      action: "STATUTORY_PAYMENT_VOID",
      entityType: "StatutoryPayment",
      entityId: row.id,
      after: { status: "VOID", reason: input.reason ?? null },
    });
    return updated;
  });
}

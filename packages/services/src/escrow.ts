import type { Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";
import { postJournalEntry, reverseJournalEntry, ACCT } from "./gl-posting";

/* ─────────────────────────────────────────────────────────────
 * RERA escrow — the ledger side of S.4(2)(l)(D).
 *
 * Sale receipts on a project with a designated escrow account post to
 * 1060 (see saleCashAccount in gl-posting). This module owns the other
 * half: certified withdrawals out of escrow into operating cash. Every
 * withdrawal records the three signatories RERA requires (engineer,
 * architect, practising CA) — the certificate document is attached on
 * the row, and the posted JE is the bank-visible transfer.
 * ───────────────────────────────────────────────────────────── */

/** Ledgered escrow balance for one project — what 1060 actually holds
 *  for its sales, minus certified withdrawals. Receipt lines tag the sale
 *  or payment entity; withdrawal lines tag the EscrowWithdrawal row, which
 *  resolves the project directly. */
export async function projectEscrowLedgerBalance(
  tx: Prisma.TransactionClient,
  companyId: string,
  projectId: string,
): Promise<Decimal> {
  const account = await tx.glAccount.findFirst({
    where: { companyId, code: ACCT.ESCROW },
    select: { id: true },
  });
  if (!account) return new Decimal(0);
  const lines = await tx.journalLine.findMany({
    where: {
      accountId: account.id,
      journalEntry: { companyId, status: "POSTED" },
      OR: [{ entityType: "AssetSale" }, { entityType: "AssetSalePayment" }, { entityType: "EscrowWithdrawal" }],
    },
    select: { debit: true, credit: true, entityType: true, entityId: true },
  });
  const saleIds = lines.filter((l) => l.entityType === "AssetSale").map((l) => l.entityId!);
  const paymentIds = lines.filter((l) => l.entityType === "AssetSalePayment").map((l) => l.entityId!);
  const withdrawalIds = lines.filter((l) => l.entityType === "EscrowWithdrawal").map((l) => l.entityId!);
  const [projSales, projPayments, projWithdrawals] = await Promise.all([
    tx.assetSale.findMany({ where: { id: { in: saleIds }, projectId }, select: { id: true } }),
    tx.assetSalePayment.findMany({ where: { id: { in: paymentIds }, assetSale: { projectId } }, select: { id: true } }),
    tx.escrowWithdrawal.findMany({ where: { id: { in: withdrawalIds }, projectId }, select: { id: true } }),
  ]);
  const inScopeSales = new Set(projSales.map((s) => s.id));
  const inScopePayments = new Set(projPayments.map((p) => p.id));
  const inScopeWithdrawals = new Set(projWithdrawals.map((w) => w.id));
  return lines.reduce((sum, l) => {
    const inScope =
      l.entityType === "AssetSale" ? inScopeSales.has(l.entityId!) :
      l.entityType === "AssetSalePayment" ? inScopePayments.has(l.entityId!) :
      inScopeWithdrawals.has(l.entityId!);
    return inScope ? sum.plus(new Decimal(l.debit)).minus(new Decimal(l.credit)) : sum;
  }, new Decimal(0));
}

/**
 * Record a certified escrow withdrawal: Dr Cash (1000) / Cr Escrow (1060).
 *
 * Guards, in order: the project must have a designated escrow account;
 * all three signatory names are mandatory (a withdrawal without the
 * certificate is exactly what RERA audits for); and the amount cannot
 * exceed what the project's escrow ledger actually holds.
 */
export async function recordEscrowWithdrawal(input: {
  /** The caller's company — the project must belong to it (tenant guard). */
  companyId: string;
  projectId: string;
  amount: Decimal | number | string;
  purpose: string;
  engineerName: string;
  architectName: string;
  caName: string;
  certificateUrl?: string;
  postedById?: string;
}) {
  return withSerializableTransaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (!project || project.companyId !== input.companyId) {
      throw new ServiceError("Project not found", 404);
    }
    if (!project.escrowAccountNo) {
      throw new ServiceError(
        "No designated escrow account on this project — withdrawals only exist against a RERA designated account.",
        409,
      );
    }
    const amount = new Decimal(input.amount);
    if (!amount.gt(0)) throw new ServiceError("Withdrawal amount must be > 0", 400);
    for (const [label, name] of [["engineer", input.engineerName], ["architect", input.architectName], ["chartered accountant", input.caName]] as const) {
      if (!name?.trim()) throw new ServiceError(`Sec 4(2)(l)(D) requires the ${label}'s certificate — name is mandatory`, 400);
    }
    if (!input.purpose?.trim()) throw new ServiceError("Withdrawal purpose is required", 400);

    const escrowBalance = await projectEscrowLedgerBalance(tx, project.companyId, input.projectId);
    if (amount.gt(escrowBalance)) {
      throw new ServiceError(
        `Withdrawal ₹${amount.toFixed(2)} exceeds the project's ledgered escrow balance ₹${escrowBalance.toFixed(2)} — the money isn't in the designated account.`,
        409,
      );
    }

    const last = await tx.escrowWithdrawal.findFirst({
      where: { projectId: input.projectId },
      orderBy: { withdrawalNo: "desc" },
      select: { withdrawalNo: true },
    });
    const withdrawal = await tx.escrowWithdrawal.create({
      data: {
        companyId: project.companyId,
        projectId: input.projectId,
        withdrawalNo: (last?.withdrawalNo ?? 0) + 1,
        amount,
        purpose: input.purpose.trim(),
        engineerName: input.engineerName.trim(),
        architectName: input.architectName.trim(),
        caName: input.caName.trim(),
        certificateUrl: input.certificateUrl ?? null,
        postedById: input.postedById ?? null,
      },
    });

    await postJournalEntry(tx, {
      companyId: project.companyId,
      sourceType: "ESCROW_WITHDRAWAL",
      sourceId: withdrawal.id,
      memo: `RERA escrow withdrawal #${withdrawal.withdrawalNo} — ${input.purpose.trim()}`,
      postedById: input.postedById,
      lines: [
        { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "EscrowWithdrawal", entityId: withdrawal.id, memo: "Escrow → operating bank" },
        { accountCode: ACCT.ESCROW, debit: 0, credit: amount, entityType: "EscrowWithdrawal", entityId: withdrawal.id, memo: "Certified withdrawal" },
      ],
    });
    return withdrawal;
  });
}

/** Void a wrongly-recorded withdrawal — the JE reverses, the row stays. */
export async function voidEscrowWithdrawal(input: { withdrawalId: string; voidReason: string; companyId: string; postedById?: string }) {
  return withSerializableTransaction(async (tx) => {
    const w = await tx.escrowWithdrawal.findUnique({ where: { id: input.withdrawalId } });
    if (!w || w.companyId !== input.companyId) throw new ServiceError("Withdrawal not found", 404);
    if (w.status === "VOID") throw new ServiceError("Withdrawal already voided", 409);
    const je = await tx.journalEntry.findFirst({
      where: { sourceType: "ESCROW_WITHDRAWAL", sourceId: w.id, status: "POSTED" },
      select: { id: true },
    });
    if (je) {
      await reverseJournalEntry(tx, je.id, {
        postedById: input.postedById,
        memo: `Escrow withdrawal voided — ${input.voidReason}`,
      });
    }
    return tx.escrowWithdrawal.update({
      where: { id: w.id },
      data: { status: "VOID", voidReason: input.voidReason },
    });
  });
}

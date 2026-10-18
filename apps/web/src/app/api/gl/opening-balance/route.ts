import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { postJournalEntry, withSerializableTransaction } from "@nirman/services";
import { apiHandler, getCompany, json, jsonBody, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

const SOURCE_ID = "cash-bank";

/**
 * Opening cash/bank balance — a company going live already has money in the
 * bank. Without this, "Cash Position" reads ₹0 and every downstream KPI is
 * wrong. Posts Dr Cash/Bank (1000) / Cr Opening Balance Equity (3100).
 *
 * Idempotent by rejection: one opening entry per company — a second POST is a
 * 409, not a second posting. Corrections go through a reversal, not re-post.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const amount = Number((body as { amount?: unknown }).amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (amount > 1e10) {
    return json({ error: "Value exceeds system limit (1e10)" }, { status: 400 });
  }
  const asOf = (body as { asOfDate?: string }).asOfDate;
  const entryDate = asOf ? new Date(asOf) : new Date();
  if (asOf && isNaN(entryDate.getTime())) {
    return json({ error: "Invalid as-of date" }, { status: 400 });
  }
  const memo = String((body as { memo?: unknown }).memo ?? "").slice(0, 500) || null;

  const existing = await prisma.journalEntry.findFirst({
    where: {
      companyId: company.id,
      sourceType: "OPENING",
      sourceId: SOURCE_ID,
      status: "POSTED",
      reversalOfId: null,
    },
    select: { id: true, entryNumber: true },
  });
  if (existing) {
    return json(
      { error: `Opening cash balance is already posted (${existing.entryNumber}). Correct it with a reversal rather than posting again.` },
      { status: 409 },
    );
  }

  const entry = await withSerializableTransaction(async (tx) =>
    postJournalEntry(tx, {
      companyId: company.id,
      sourceType: "OPENING",
      sourceId: SOURCE_ID,
      entryDate,
      postedById: user.id,
      memo: memo ?? "Opening cash/bank balance",
      lines: [
        { accountCode: "1000", debit: amount, credit: 0, entityType: "OpeningBalance", entityId: company.id },
        { accountCode: "3100", debit: 0, credit: amount, entityType: "OpeningBalance", entityId: company.id, memo: "Opening balance offset" },
      ],
    }),
  );

  if (!entry) {
    return json({ error: "Amount must be > 0" }, { status: 400 });
  }
  return json({ ok: true, entryNumber: entry.entryNumber, amount }, { status: 201 });
});

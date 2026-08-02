import { NextRequest } from "next/server";
import { trialBalance } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/gl/trial-balance
 * Returns the per-account trial balance (debits, credits, running balance)
 * for the current company, plus totals and a balanced flag.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const tb = await trialBalance(company.id);
  return json({
    accounts: tb.accounts.map((a) => ({
      code: a.code,
      name: a.name,
      type: a.type,
      debit: a.debit.toString(),
      credit: a.credit.toString(),
      balance: a.balance.toString(),
    })),
    totalDebit: tb.totalDebit.toString(),
    totalCredit: tb.totalCredit.toString(),
    isBalanced: tb.isBalanced,
  });
});

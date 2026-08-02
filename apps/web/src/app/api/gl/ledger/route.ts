import { NextRequest } from "next/server";
import { accountLedger } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/gl/ledger?account=1300
 * Returns all posted journal lines for a single GL account, newest first.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const accountCode = searchParams.get("account");
  if (!accountCode) return json({ error: "account query param is required" }, { status: 400 });

  const lines = await accountLedger(company.id, accountCode);
  return json(
    lines.map((l) => ({
      id: l.id,
      entryNumber: l.entryNumber,
      entryDate: l.entryDate.toISOString(),
      sourceType: l.sourceType,
      memo: l.memo,
      debit: l.debit.toString(),
      credit: l.credit.toString(),
      entityType: l.entityType,
      entityId: l.entityId,
    })),
  );
});

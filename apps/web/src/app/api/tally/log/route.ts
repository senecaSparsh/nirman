import { NextRequest } from "next/server";
import { getTallySyncLog } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/tally/log?status=PENDING|SYNCED|FAILED
 * Get the Tally sync log for the current company.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "PENDING" | "SYNCED" | "FAILED" | "IMPORTED" | "VARIANCE" | null;

  const logs = await getTallySyncLog(company.id, status ?? undefined);

  return json({
    rows: logs.map((l) => ({
      id: l.id,
      journalEntryId: l.journalEntryId,
      entryNumber: l.journalEntry?.entryNumber ?? l.referenceNumber ?? l.tallyVoucherNumber ?? "—",
      entryDate: l.journalEntry?.entryDate.toISOString() ?? null,
      sourceType: l.journalEntry?.sourceType ?? "IMPORTED",
      memo: l.journalEntry?.memo ?? null,
      totalDebit: l.journalEntry ? toNum(l.journalEntry.totalDebit) : (l.tallyAmount ? toNum(l.tallyAmount) : null),
      tallyVoucherType: l.tallyVoucherType,
      tallyVoucherNumber: l.tallyVoucherNumber,
      syncStatus: l.syncStatus,
      syncedAt: l.syncedAt?.toISOString() ?? null,
      errorMessage: l.errorMessage,
    })),
  });
});

import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { accountLedger } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { dateParam, apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/gl/ledger?account=1300
 * Returns posted journal lines for a single GL account, newest first.
 *
 * Pagination:
 *   - `limit` (default 100, max 500) — page size
 *   - `cursor` — journal line ID to fetch the next page after
 *   - `startDate` / `endDate` — filter by entry date (ISO strings)
 *
 * Response: { lines: [...], hasMore: boolean, nextCursor: string | null }
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const accountCode = searchParams.get("account");
  if (!accountCode) return json({ error: "account query param is required" }, { status: 400 });

  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
  const startDate = dateParam(searchParams.get("startDate"));
  const endDate = dateParam(searchParams.get("endDate"));

  const result = await accountLedger(company.id, accountCode, {
    cursor,
    limit,
    startDate,
    endDate,
  });

  // One query for the whole page — which of these entries already carry a
  // reversal JE (reversalOfId links reversal → original).
  const entryIds = result.lines.map((l) => l.journalEntryId);
  const reversals = entryIds.length
    ? await prisma.journalEntry.findMany({
        where: { companyId: company.id, reversalOfId: { in: entryIds } },
        select: { reversalOfId: true },
      })
    : [];
  const reversedSet = new Set(reversals.map((r) => r.reversalOfId));

  return json({
    lines: result.lines.map((l) => ({
      id: l.id,
      journalEntryId: l.journalEntryId,
      entryNumber: l.entryNumber,
      entryDate: l.entryDate.toISOString(),
      sourceType: l.sourceType,
      isReversed: reversedSet.has(l.journalEntryId),
      memo: l.memo,
      debit: l.debit.toString(),
      credit: l.credit.toString(),
      entityType: l.entityType,
      entityId: l.entityId,
    })),
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  });
});

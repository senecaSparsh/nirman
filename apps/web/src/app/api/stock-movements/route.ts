import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  apiHandler, getCompany, json, requireAnyEffectivePermission, scopeWhere,
} from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/stock-movements — the inventory movement ledger.
 *
 * Returns the unified movement feed (receipts, issues, transfers, adjustments,
 * wastage, returns) that powers the /stock?tab=movements view — but as a REST
 * API so mobile/reporting/audit consumers can read it too. The page loads the
 * same data server-side; this endpoint exposes it for clients.
 *
 * Movements are cross-location records: a transfer has both a fromLocation and
 * a toLocation, and either may belong to a different project/department than
 * the other. Company-scoping is therefore OR'd across both endpoints — a
 * movement is visible when either side belongs to the company. Project/dept
 * scoping comes from scopeWhere("StockMovement") which maps to the locations'
 * projectId/departmentId.
 *
 * Query params:
 *  - limit       (default 200, max 500)
 *  - cursor      (id of last row from previous page → next page)
 *  - materialId  (filter to one material)
 *  - locationId  (movements touching this location, either side)
 *  - type        (movementType — ISSUE_TO_PROJECT, RECEIPT, TRANSFER, …)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireAnyEffectivePermission(
    PERM.INVENTORY_VIEW, PERM.STOCK_ISSUE, PERM.STOCK_TRANSFER,
    PERM.PROCUREMENT_VIEW, PERM.ASSETS_VIEW, PERM.FINANCE_VIEW,
  );
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);
  const cursor = searchParams.get("cursor") ?? undefined;
  const materialId = searchParams.get("materialId") ?? undefined;
  const locationId = searchParams.get("locationId") ?? undefined;
  const type = searchParams.get("type") ?? undefined;

  const where: Record<string, unknown> = {
    // Company visibility: either endpoint belongs to the company. AND-composed
    // with the location scope so neither OR silently drops the other.
    AND: [
      { OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }] },
      await scopeWhere("StockMovement"),
    ],
    ...(materialId ? { materialId } : {}),
    ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}),
    ...(type ? { movementType: type } : {}),
  };

  // One extra row detects truncation without a separate count.
  const movements = await prisma.stockMovement.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: { timestamp: "desc" },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  const hasMore = movements.length > limit;
  const rows = hasMore ? movements.slice(0, limit) : movements;
  const nextCursor = hasMore ? rows[rows.length - 1]?.id : undefined;

  return json({ rows, hasMore, nextCursor, count: rows.length });
});

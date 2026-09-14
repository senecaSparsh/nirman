import { NextRequest } from "next/server";
import { Prisma, prisma } from "@nirman/db";
import { apiHandler, getCompany, getUserScope, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/stock-movement-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Saleable Stock Movement Report — a digital version of the client's paper
 * "Saleable Stock Report" showing Opening, Received, Issued, and Balance
 * stock value for a period. The stock equivalent of a cash-flow statement.
 *
 * Movement classification (company-wide, so internal transfers cancel out):
 *   IN  (adds to company stock):  PURCHASE_RECEIPT, ADJUSTMENT_IN
 *   OUT (reduces company stock):  ISSUE_TO_PROJECT, ISSUE_TO_DEPARTMENT,
 *                                 ADJUSTMENT_OUT, RETURN, SALE
 *   EXCLUDED (internal):          TRANSFER_IN, TRANSFER_OUT (net to zero company-wide)
 *
 * Identity: Opening + Received − Issued = Balance
 * Opening = (all IN before `from`) − (all OUT before `from`)
 *
 * All aggregation runs in the database (SUM(qty × unitCost) via $queryRaw) —
 * the previous version hydrated every historical StockMovement row into JS,
 * which grew linearly with company history and would OOM on large ledgers.
 *
 * Scope semantics: StockMovement has no projectId column, so scopeWhere's
 * project mapping never worked for this report (it threw for project-scoped
 * users). Scope is applied on the movement's *location* instead — a
 * project-scoped user sees movements at locations belonging to their
 * projects (StockLocation.projectId). DEPARTMENT scope is unscoped here,
 * matching scopeWhere's behavior (StockMovement has no department field).
 */

const IN_TYPES = ["PURCHASE_RECEIPT", "ADJUSTMENT_IN"];
const OUT_TYPES = ["ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Default to current financial year if not provided
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = from ? new Date(from) : fyStart;
  const toDate = to ? new Date(to) : now;
  toDate.setHours(23, 59, 59, 999);

  // Project-scoped users only see movements at their projects' locations.
  const scope = await getUserScope();
  const scoped = scope.scopeType === "PROJECT" && scope.projectIds.length > 0;
  const scopeSql = scoped ? Prisma.sql`AND l."projectId" IN (${Prisma.join(scope.projectIds)})` : Prisma.empty;

  const [
    openingInRows,
    openingOutRows,
    inByLocation,
    outByLocation,
    inByCategory,
    outByCategory,
    locationItems,
  ] = await Promise.all([
    // ── Opening: all IN before `from` ──
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(m.qty * m."unitCost"), 0)::float8 AS total
      FROM "StockMovement" m
      JOIN "StockLocation" l ON l.id = m."toLocationId"
      WHERE m."movementType"::text IN (${Prisma.join(IN_TYPES)})
        AND l."companyId" = ${company.id}
        AND l."deletedAt" IS NULL
        AND m."timestamp" < ${fromDate}
        ${scopeSql}
    `,
    // ── Opening: all OUT before `from` ──
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(m.qty * m."unitCost"), 0)::float8 AS total
      FROM "StockMovement" m
      JOIN "StockLocation" l ON l.id = m."fromLocationId"
      WHERE m."movementType"::text IN (${Prisma.join(OUT_TYPES)})
        AND l."companyId" = ${company.id}
        AND l."deletedAt" IS NULL
        AND m."timestamp" < ${fromDate}
        ${scopeSql}
    `,
    // ── Period IN per location ──
    prisma.$queryRaw<{ id: string; name: string; type: string; received: number }[]>`
      SELECT l.id, l.name, l.type::text AS type,
             SUM(m.qty * m."unitCost")::float8 AS received
      FROM "StockMovement" m
      JOIN "StockLocation" l ON l.id = m."toLocationId"
      WHERE m."movementType"::text IN (${Prisma.join(IN_TYPES)})
        AND l."companyId" = ${company.id}
        AND l."deletedAt" IS NULL
        AND m."timestamp" >= ${fromDate} AND m."timestamp" <= ${toDate}
        ${scopeSql}
      GROUP BY l.id, l.name, l.type
    `,
    // ── Period OUT per location ──
    prisma.$queryRaw<{ id: string; name: string; type: string; issued: number }[]>`
      SELECT l.id, l.name, l.type::text AS type,
             SUM(m.qty * m."unitCost")::float8 AS issued
      FROM "StockMovement" m
      JOIN "StockLocation" l ON l.id = m."fromLocationId"
      WHERE m."movementType"::text IN (${Prisma.join(OUT_TYPES)})
        AND l."companyId" = ${company.id}
        AND l."deletedAt" IS NULL
        AND m."timestamp" >= ${fromDate} AND m."timestamp" <= ${toDate}
        ${scopeSql}
      GROUP BY l.id, l.name, l.type
    `,
    // ── Period IN per category ──
    prisma.$queryRaw<{ categoryName: string; received: number }[]>`
      SELECT c.name AS "categoryName",
             SUM(m.qty * m."unitCost")::float8 AS received
      FROM "StockMovement" m
      JOIN "StockLocation" l ON l.id = m."toLocationId"
      JOIN "Material" mat ON mat.id = m."materialId"
      JOIN "MaterialCategory" c ON c.id = mat."categoryId"
      WHERE m."movementType"::text IN (${Prisma.join(IN_TYPES)})
        AND l."companyId" = ${company.id}
        AND l."deletedAt" IS NULL
        AND m."timestamp" >= ${fromDate} AND m."timestamp" <= ${toDate}
        ${scopeSql}
      GROUP BY c.name
    `,
    // ── Period OUT per category ──
    prisma.$queryRaw<{ categoryName: string; issued: number }[]>`
      SELECT c.name AS "categoryName",
             SUM(m.qty * m."unitCost")::float8 AS issued
      FROM "StockMovement" m
      JOIN "StockLocation" l ON l.id = m."fromLocationId"
      JOIN "Material" mat ON mat.id = m."materialId"
      JOIN "MaterialCategory" c ON c.id = mat."categoryId"
      WHERE m."movementType"::text IN (${Prisma.join(OUT_TYPES)})
        AND l."companyId" = ${company.id}
        AND l."deletedAt" IS NULL
        AND m."timestamp" >= ${fromDate} AND m."timestamp" <= ${toDate}
        ${scopeSql}
      GROUP BY c.name
    `,
    // ── Live current-state (used for balance + per-location opening) ──
    prisma.stockLocationItem.findMany({
      where: {
        location: {
          companyId: company.id,
          deletedAt: null,
          ...(scoped ? { projectId: { in: scope.projectIds } } : {}),
        },
        material: { deletedAt: null },
      },
      include: {
        location: { select: { id: true, name: true, type: true } },
      },
    }),
  ]);

  const opening = (openingInRows[0]?.total ?? 0) - (openingOutRows[0]?.total ?? 0);
  const received = inByLocation.reduce((s, r) => s + r.received, 0);
  const issued = outByLocation.reduce((s, r) => s + r.issued, 0);

  // Balance = Opening + Received - Issued (also verifiable against live StockLocationItem)
  const balance = opening + received - issued;
  const liveBalance = locationItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
  const balanceQty = locationItems.reduce((s, i) => s + toNum(i.qty), 0);

  // Per-location breakdown — same derivation as before:
  // received/issued from the period aggregates, balance from live items,
  // opening back-computed as balance - received + issued.
  const byLocation = new Map<string, { name: string; type: string; opening: number; received: number; issued: number; balance: number }>();

  function locRow(id: string, name: string, type: string) {
    let row = byLocation.get(id);
    if (!row) {
      row = { name, type, opening: 0, received: 0, issued: 0, balance: 0 };
      byLocation.set(id, row);
    }
    return row;
  }

  for (const r of inByLocation) locRow(r.id, r.name, r.type).received = r.received;
  for (const r of outByLocation) locRow(r.id, r.name, r.type).issued = r.issued;
  for (const item of locationItems) {
    const loc = item.location;
    const row = locRow(loc.id, loc.name, loc.type);
    row.balance += toNum(item.qty) * toNum(item.movingAvgCost);
    row.opening = row.balance - row.received + row.issued;
  }

  const locationRows = Array.from(byLocation.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.balance - a.balance);

  // Per-category breakdown (period movements only)
  const byCategory = new Map<string, { name: string; received: number; issued: number }>();
  for (const r of inByCategory) {
    byCategory.set(r.categoryName, { name: r.categoryName, received: r.received, issued: 0 });
  }
  for (const r of outByCategory) {
    const row = byCategory.get(r.categoryName) ?? { name: r.categoryName, received: 0, issued: 0 };
    row.issued = r.issued;
    byCategory.set(r.categoryName, row);
  }
  const categoryRows = Array.from(byCategory.values()).sort((a, b) => (b.received + b.issued) - (a.received + a.issued));

  return json({
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    opening,
    received,
    issued,
    balance,
    balanceQty,
    liveBalance,
    locationRows,
    categoryRows,
  });
});

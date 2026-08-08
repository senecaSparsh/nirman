import { NextRequest } from "next/server";
import { prisma, type StockMovementType } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
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
 */
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

  const IN_TYPES: StockMovementType[] = ["PURCHASE_RECEIPT", "ADJUSTMENT_IN"];
  const OUT_TYPES: StockMovementType[] = ["ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];

  // Fetch all relevant movements: IN (toLocation belongs to company) + OUT (fromLocation belongs to company)
  // We need movements before `fromDate` (for opening) and in [fromDate, toDate] (for rec/issue)
  const [inBefore, outBefore, inPeriod, outPeriod, locationItems] = await Promise.all([
    prisma.stockMovement.findMany({
      where: {
        movementType: { in: IN_TYPES },
        toLocation: { companyId: company.id, deletedAt: null },
        timestamp: { lt: fromDate },
      },
      select: { qty: true, unitCost: true, toLocationId: true, materialId: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        movementType: { in: OUT_TYPES },
        fromLocation: { companyId: company.id, deletedAt: null },
        timestamp: { lt: fromDate },
      },
      select: { qty: true, unitCost: true, fromLocationId: true, materialId: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        movementType: { in: IN_TYPES },
        toLocation: { companyId: company.id, deletedAt: null },
        timestamp: { gte: fromDate, lte: toDate },
      },
      include: {
        material: { select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } } },
        toLocation: { select: { id: true, name: true, type: true } },
      },
      orderBy: { timestamp: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: {
        movementType: { in: OUT_TYPES },
        fromLocation: { companyId: company.id, deletedAt: null },
        timestamp: { gte: fromDate, lte: toDate },
      },
      include: {
        material: { select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } } },
        fromLocation: { select: { id: true, name: true, type: true } },
      },
      orderBy: { timestamp: "asc" },
    }),
    prisma.stockLocationItem.findMany({
      where: {
        location: { companyId: company.id, deletedAt: null },
        material: { deletedAt: null },
      },
      include: {
        location: { select: { id: true, name: true, type: true } },
        material: { select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } } },
      },
    }),
  ]);

  // Compute opening value = sum(IN before) - sum(OUT before)
  const openingIn = inBefore.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const openingOut = outBefore.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const opening = openingIn - openingOut;

  // Compute received and issued in period
  const received = inPeriod.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const issued = outPeriod.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);

  // Balance = Opening + Received - Issued (also verifiable against live StockLocationItem)
  const balance = opening + received - issued;
  const liveBalance = locationItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
  const balanceQty = locationItems.reduce((s, i) => s + toNum(i.qty), 0);

  // Per-location breakdown
  const byLocation = new Map<string, { name: string; type: string; opening: number; received: number; issued: number; balance: number }>();
  // Per-location rec/issue from period movements
  for (const m of inPeriod) {
    const loc = m.toLocation!;
    if (!byLocation.has(loc.id)) {
      byLocation.set(loc.id, { name: loc.name, type: loc.type, opening: 0, received: 0, issued: 0, balance: 0 });
    }
    byLocation.get(loc.id)!.received += toNum(m.qty) * toNum(m.unitCost);
  }
  for (const m of outPeriod) {
    const loc = m.fromLocation!;
    if (!byLocation.has(loc.id)) {
      byLocation.set(loc.id, { name: loc.name, type: loc.type, opening: 0, received: 0, issued: 0, balance: 0 });
    }
    byLocation.get(loc.id)!.issued += toNum(m.qty) * toNum(m.unitCost);
  }
  // Compute per-location balance from live items
  for (const item of locationItems) {
    const loc = item.location;
    if (!byLocation.has(loc.id)) {
      byLocation.set(loc.id, { name: loc.name, type: loc.type, opening: 0, received: 0, issued: 0, balance: 0 });
    }
    const row = byLocation.get(loc.id)!;
    row.balance += toNum(item.qty) * toNum(item.movingAvgCost);
    // Opening = balance - received + issued
    row.opening = row.balance - row.received + row.issued;
  }

  const locationRows = Array.from(byLocation.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.balance - a.balance);

  // Per-category breakdown (period movements only)
  const byCategory = new Map<string, { name: string; received: number; issued: number }>();
  for (const m of inPeriod) {
    const cat = m.material.category.name;
    if (!byCategory.has(cat)) byCategory.set(cat, { name: cat, received: 0, issued: 0 });
    byCategory.get(cat)!.received += toNum(m.qty) * toNum(m.unitCost);
  }
  for (const m of outPeriod) {
    const cat = m.material.category.name;
    if (!byCategory.has(cat)) byCategory.set(cat, { name: cat, received: 0, issued: 0 });
    byCategory.get(cat)!.issued += toNum(m.qty) * toNum(m.unitCost);
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

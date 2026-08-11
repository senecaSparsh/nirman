import { Suspense } from "react";
import { connection } from "next/server";
import { prisma, type StockMovementType } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { StockMovementSummaryReport } from "@/components/reports/stock-movement-summary-report";

import { NoAccess } from "@/components/no-access";

/**
 * Saleable Stock Movement Report — a digital version of the client's paper
 * "Saleable Stock Report" showing Opening, Received, Issued, and Balance
 * stock value for a period. The stock equivalent of a cash-flow statement.
 *
 * Identity: Opening + Received − Issued = Balance
 */
export default function StockMovementSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading stock movement summary…" variant="cards" />}>
        <StockMovementSummaryContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StockMovementSummaryContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="the stock movement summary" />;
  }

  // Default to current financial year (Apr 1 → Mar 31) if no range given
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);

  const IN_TYPES: StockMovementType[] = ["PURCHASE_RECEIPT", "ADJUSTMENT_IN"];
  const OUT_TYPES: StockMovementType[] = ["ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];

  const [inBefore, outBefore, inPeriod, outPeriod, locationItems] = await Promise.all([
    prisma.stockMovement.findMany({
      where: {
        movementType: { in: IN_TYPES },
        toLocation: { companyId: company.id, deletedAt: null },
        timestamp: { lt: fromDate },
      },
      select: { qty: true, unitCost: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        movementType: { in: OUT_TYPES },
        fromLocation: { companyId: company.id, deletedAt: null },
        timestamp: { lt: fromDate },
      },
      select: { qty: true, unitCost: true },
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

  const openingIn = inBefore.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const openingOut = outBefore.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const opening = openingIn - openingOut;

  const received = inPeriod.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const issued = outPeriod.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);

  const balance = opening + received - issued;
  const liveBalance = locationItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
  const balanceQty = locationItems.reduce((s, i) => s + toNum(i.qty), 0);

  // Per-location breakdown
  const byLocation = new Map<string, { name: string; type: string; opening: number; received: number; issued: number; balance: number }>();
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
  for (const item of locationItems) {
    const loc = item.location;
    if (!byLocation.has(loc.id)) {
      byLocation.set(loc.id, { name: loc.name, type: loc.type, opening: 0, received: 0, issued: 0, balance: 0 });
    }
    const row = byLocation.get(loc.id)!;
    row.balance += toNum(item.qty) * toNum(item.movingAvgCost);
    row.opening = row.balance - row.received + row.issued;
  }

  const locationRows = Array.from(byLocation.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.balance - a.balance);

  // Per-category breakdown
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
  const categoryRows = Array.from(byCategory.values()).sort(
    (a, b) => b.received + b.issued - (a.received + a.issued),
  );

  const report = {
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
  };

  return (
    <>
      <PageHeader
        title="Stock Movement Summary"
        description="Opening, received, issued, and balance stock value for the period — the stock equivalent of a cash-flow statement. A digital version of the paper Saleable Stock Report."
        stats={[
          { label: "Opening", value: formatCurrency(opening) },
          { label: "Received", value: formatCurrency(received) },
          { label: "Issued", value: formatCurrency(issued) },
          { label: "Balance", value: formatCurrency(balance) },
        ]}
      />
      <StockMovementSummaryReport report={report} />
    </>
  );
}

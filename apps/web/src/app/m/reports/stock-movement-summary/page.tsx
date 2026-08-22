import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma, type StockMovementType } from "@nirman/db";
import { PackageOpen, ArrowDownToLine, ArrowUpFromLine, Scale, MapPin, Boxes, Package } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/stock-movement-summary — mobile stock movement summary report.
 * Shows Opening + Received − Issued = Balance for the current financial year,
 * with per-location and per-category breakdowns.
 */
export default function MobileStockMovementSummaryPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileStockMovementSummaryContent />
    </Suspense>
  );
}

async function MobileStockMovementSummaryContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) notFound();
  const company = await getCompany();

  // Current financial year (Apr 1 → now)
  const now = new Date();
  const fromDate = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);

  const IN_TYPES: StockMovementType[] = ["PURCHASE_RECEIPT", "ADJUSTMENT_IN"];
  const OUT_TYPES: StockMovementType[] = [
    "ISSUE_TO_PROJECT",
    "ISSUE_TO_DEPARTMENT",
    "ADJUSTMENT_OUT",
    "RETURN",
    "SALE",
  ];

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
        material: {
          select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } },
        },
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
        material: {
          select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } },
        },
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
        material: {
          select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } },
        },
      },
    }),
  ]);

  const openingIn = inBefore.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const openingOut = outBefore.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const opening = openingIn - openingOut;

  const received = inPeriod.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);
  const issued = outPeriod.reduce((s, m) => s + toNum(m.qty) * toNum(m.unitCost), 0);

  const balance = opening + received - issued;

  // Per-location breakdown
  const byLocation = new Map<
    string,
    { name: string; type: string; opening: number; received: number; issued: number; balance: number }
  >();
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

  if (locationRows.length === 0 && categoryRows.length === 0) {
    return (
      <MobileEmptyState
        icon={PackageOpen}
        title="No stock movements this year"
        hint="Receipts and issues for the current financial year will appear here"
      />
    );
  }

  const fyLabel = `FY ${fromDate.getFullYear()}-${String(fromDate.getFullYear() + 1).slice(2)}`;

  const locationCsvColumns: MobileColumnSpec[] = [
    { key: "name", label: "Location" },
    { key: "type", label: "Type" },
    { key: "opening", label: "Opening", format: "currency" },
    { key: "received", label: "Received", format: "currency" },
    { key: "issued", label: "Issued", format: "currency" },
    { key: "balance", label: "Balance", format: "currency" },
  ];

  const categoryCsvColumns: MobileColumnSpec[] = [
    { key: "name", label: "Category" },
    { key: "received", label: "Received", format: "currency" },
    { key: "issued", label: "Issued", format: "currency" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Stock Movement Summary"
        subtitle="Opening + Received − Issued = Balance"
        icon={Package}
        period={fyLabel}
      />

      <MobileReportSummary
        items={[
          { label: "Opening Value", value: formatCurrency(opening) },
          { label: "Received", value: formatCurrency(received), tone: "go" },
          { label: "Issued", value: formatCurrency(issued), tone: "signal" },
          { label: "Balance", value: formatCurrency(balance), tone: balance >= 0 ? "default" : "stop" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Stock Movement Summary"
          rows={locationRows as unknown as Record<string, unknown>[]}
          columns={locationCsvColumns}
          summary={`Opening: ${formatCurrency(opening)} · Received: ${formatCurrency(received)} · Issued: ${formatCurrency(issued)} · Balance: ${formatCurrency(balance)}`}
        />
      </div>

      {/* Received vs Issued by location — bar chart */}
      <MobileSectionTitle>Received vs Issued by Location</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={locationRows.map((l) => ({
            label: l.name,
            value: l.received - l.issued,
            tone: l.received >= l.issued ? ("go" as const) : ("stop" as const),
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* By location */}
      <MobileSectionTitle>By Location</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {locationRows.map((l) => (
          <MobileRow
            key={l.id}
            icon={MapPin}
            title={l.name}
            subtitle={`Open ${formatCurrency(l.opening)} · Recd ${formatCurrency(l.received)} · Issued ${formatCurrency(l.issued)}`}
            meta={formatCurrency(l.balance)}
            metaSub="Balance"
            tone="success"
          />
        ))}
      </div>

      {/* By category */}
      {categoryRows.length > 0 && (
        <>
          <MobileSectionTitle>By Category</MobileSectionTitle>
          <div className="mb-4">
            <MobileExportShareBar
              title="Stock Movement By Category"
              rows={categoryRows as unknown as Record<string, unknown>[]}
              columns={categoryCsvColumns}
              summary={`${categoryRows.length} categories · Received ${formatCurrency(received)} · Issued ${formatCurrency(issued)}`}
            />
          </div>
          <div className="flex flex-col gap-2">
            {categoryRows.map((c) => (
              <MobileRow
                key={c.name}
                icon={Boxes}
                title={c.name}
                subtitle={`Received ${formatCurrency(c.received)} · Issued ${formatCurrency(c.issued)}`}
                meta={formatCurrency(c.received - c.issued)}
                metaSub="Net"
                tone="default"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

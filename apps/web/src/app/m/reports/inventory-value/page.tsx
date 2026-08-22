import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Package, Layers, MapPin } from "lucide-react";
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
 * /m/reports/inventory-value — mobile inventory value report.
 * Stock value (qty × MAC) by location and category.
 */
export default function MobileInventoryValuePage({
  searchParams,
}: {
  searchParams: Promise<{ asOn?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileInventoryValueContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileInventoryValueContent({
  searchParams,
}: {
  searchParams: Promise<{ asOn?: string }>;
}) {
  await connection();
  const { asOn: asOnParam } = await searchParams;
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) notFound();
  const company = await getCompany();

  // Live mode only (historical mode is heavy — desktop-only)
  const liveItems = await prisma.stockLocationItem.findMany({
    where: {
      location: { deletedAt: null, companyId: company.id },
      material: { deletedAt: null },
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      material: {
        select: {
          id: true, code: true, name: true, unit: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  const items = liveItems.map((item) => ({
    locationId: item.location.id,
    locationName: item.location.name,
    locationType: item.location.type,
    materialId: item.material.id,
    materialCode: item.material.code,
    materialName: item.material.name,
    materialUnit: item.material.unit,
    categoryId: item.material.category.id,
    categoryName: item.material.category.name,
    qty: toNum(item.qty),
    value: toNum(item.qty) * toNum(item.movingAvgCost),
  })).filter((i) => i.qty > 0 || i.value > 0);

  const byLocation = new Map<string, { name: string; type: string; value: number; qty: number }>();
  const byCategory = new Map<string, { name: string; value: number; qty: number }>();
  const materialTotals = new Map<string, { code: string; name: string; unit: string; categoryName: string; value: number; qty: number }>();
  let grandTotal = 0;
  let totalQty = 0;

  for (const item of items) {
    grandTotal += item.value;
    totalQty += item.qty;
    if (!byLocation.has(item.locationId)) byLocation.set(item.locationId, { name: item.locationName, type: item.locationType, value: 0, qty: 0 });
    const locRow = byLocation.get(item.locationId)!;
    locRow.value += item.value;
    locRow.qty += item.qty;
    if (!byCategory.has(item.categoryId)) byCategory.set(item.categoryId, { name: item.categoryName, value: 0, qty: 0 });
    const catRow = byCategory.get(item.categoryId)!;
    catRow.value += item.value;
    catRow.qty += item.qty;
    if (!materialTotals.has(item.materialId)) materialTotals.set(item.materialId, { code: item.materialCode, name: item.materialName, unit: item.materialUnit, categoryName: item.categoryName, value: 0, qty: 0 });
    const matRow = materialTotals.get(item.materialId)!;
    matRow.value += item.value;
    matRow.qty += item.qty;
  }

  const locationRows = Array.from(byLocation.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value);
  const categoryRows = Array.from(byCategory.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value);
  const topMaterials = Array.from(materialTotals.values()).sort((a, b) => b.value - a.value).slice(0, 15);

  if (items.length === 0) {
    return <MobileEmptyState icon={Package} title="No stock on hand" hint="Receive materials to see inventory value here" />;
  }

  const period = asOnParam ? `As on ${asOnParam}` : "Live";

  const csvColumns: MobileColumnSpec[] = [
    { key: "locationName", label: "Location" },
    { key: "materialCode", label: "Material Code" },
    { key: "materialName", label: "Material Name" },
    { key: "categoryName", label: "Category" },
    { key: "qty", label: "Qty" },
    { key: "value", label: "Value", format: "currency" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Inventory Value"
        subtitle="Stock value (qty × moving average cost) by location and category"
        icon={Package}
        period={period}
      />

      <MobileReportSummary
        items={[
          { label: "Total Value", value: formatCurrency(grandTotal) },
          { label: "Line Items", value: String(items.length) },
          { label: "Locations", value: String(locationRows.length) },
          { label: "Categories", value: String(categoryRows.length) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Inventory Value Report"
          rows={items as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Total Value: ${formatCurrency(grandTotal)} · ${items.length} line items`}
        />
      </div>

      {/* Value by location — bar chart */}
      <MobileSectionTitle>Value by Location</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={locationRows.map((l) => ({
            label: l.name,
            value: l.value,
            tone: "signal" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* By Location */}
      <MobileSectionTitle>By Location</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {locationRows.map((l) => (
          <MobileRow
            key={l.id}
            icon={MapPin}
            title={l.name}
            subtitle={`${l.qty.toFixed(2)} units · ${l.type}`}
            meta={formatCurrency(l.value)}
            tone="default"
          />
        ))}
      </div>

      {/* By Category */}
      <MobileSectionTitle>By Category</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {categoryRows.map((c) => (
          <MobileRow
            key={c.id}
            icon={Layers}
            title={c.name}
            subtitle={`${c.qty.toFixed(2)} units`}
            meta={formatCurrency(c.value)}
            tone="default"
          />
        ))}
      </div>

      {/* Top Materials */}
      <MobileSectionTitle>Top Materials</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {topMaterials.map((m) => (
          <MobileRow
            key={m.code}
            icon={Package}
            title={m.name}
            subtitle={`${m.code} · ${m.qty.toFixed(2)} ${m.unit} · ${m.categoryName}`}
            meta={formatCurrency(m.value)}
            tone="default"
          />
        ))}
      </div>
    </div>
  );
}

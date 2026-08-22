import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getRealEstateInventory } from "@nirman/services";
import { Building2, Home, TrendingUp, Wallet } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
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
 * /m/reports/real-estate-inventory — mobile real estate inventory dashboard.
 */
export default function MobileRealEstateInventoryPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRealEstateInventoryContent />
    </Suspense>
  );
}

async function MobileRealEstateInventoryContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.ASSETS_VIEW)) notFound();
  const company = await getCompany();

  const data = await getRealEstateInventory(company.id);

  const totalUnits = data.totalUnits;
  const availableUnits = data.availableUnits;
  const soldUnits = data.soldUnits;
  const totalAssetValue = toNum(data.totalAssetValue);
  const totalRevenue = toNum(data.totalRevenue);

  if (totalUnits === 0 && data.totalParcels === 0) {
    return <MobileEmptyState icon={Building2} title="No real estate inventory" hint="Create built units or land parcels to see inventory here" />;
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "name", label: "Project" },
    { key: "status", label: "Status" },
    { key: "totalUnits", label: "Total Units" },
    { key: "availableUnits", label: "Available Units" },
    { key: "soldUnits", label: "Sold Units" },
    { key: "underConstructionUnits", label: "Under Construction" },
    { key: "reservedUnits", label: "Reserved" },
    { key: "rentedUnits", label: "Rented" },
    { key: "totalAssetValue", label: "Total Asset Value", format: "currency" },
    { key: "revenue", label: "Revenue", format: "currency" },
  ];

  const projectRows = data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    totalUnits: p.totalUnits,
    availableUnits: p.availableUnits,
    soldUnits: p.soldUnits,
    underConstructionUnits: p.underConstructionUnits,
    reservedUnits: p.reservedUnits,
    rentedUnits: p.rentedUnits,
    totalAssetValue: toNum(p.totalAssetValue),
    revenue: toNum(p.revenue),
  }));

  return (
    <div>
      <MobileReportHeader
        title="Real Estate Inventory"
        subtitle="Built units, land parcels, and asset value across projects"
        icon={Building2}
        period="Live"
      />

      <MobileReportSummary
        items={[
          { label: "Total Units", value: String(totalUnits) },
          { label: "Available", value: String(availableUnits), tone: "signal" },
          { label: "Sold", value: String(soldUnits), tone: "go" },
          { label: "Asset Value", value: formatCurrency(totalAssetValue) },
          { label: "Revenue", value: formatCurrency(totalRevenue), tone: "go" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Real Estate Inventory Report"
          rows={projectRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Total Units: ${totalUnits} · Available: ${availableUnits} · Sold: ${soldUnits} · Asset Value: ${formatCurrency(totalAssetValue)}`}
        />
      </div>

      {/* Units by status — bar chart */}
      <MobileSectionTitle>Units by Status</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={[
            { label: "Available", value: data.availableUnits, tone: "signal" as const },
            { label: "Sold", value: data.soldUnits, tone: "go" as const },
            { label: "Under Construction", value: data.underConstructionUnits, tone: "default" as const },
            { label: "Reserved", value: data.reservedUnits, tone: "default" as const },
            { label: "Rented", value: data.rentedUnits, tone: "go" as const },
          ]}
          formatValue={(v) => String(v)}
        />
      </div>

      {/* Unit status breakdown */}
      <MobileSectionTitle>Unit Status</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow icon={Building2} title="Available" meta={String(data.availableUnits)} />
        <MobileRow icon={TrendingUp} title="Sold" meta={String(data.soldUnits)} tone="success" />
        <MobileRow icon={Building2} title="Under Construction" meta={String(data.underConstructionUnits)} tone="warning" />
        <MobileRow icon={Building2} title="Reserved" meta={String(data.reservedUnits)} tone="warning" />
        <MobileRow icon={Building2} title="Rented" meta={String(data.rentedUnits)} tone="success" />
      </div>

      {/* Land parcels */}
      {data.totalParcels > 0 && (
        <>
          <MobileSectionTitle>Land Parcels</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-4">
            <MobileRow icon={Building2} title="Total Parcels" meta={String(data.totalParcels)} />
            <MobileRow icon={Building2} title="Available" meta={String(data.availableParcels)} tone="warning" />
            <MobileRow icon={TrendingUp} title="Sold" meta={String(data.soldParcels)} tone="success" />
            <MobileRow icon={Building2} title="Partitioned" meta={String(data.partitionedParcels)} />
          </div>
        </>
      )}

      {/* By project */}
      {data.projects.length > 0 && (
        <>
          <MobileSectionTitle>By Project</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {data.projects.map((p) => (
              <MobileRow
                key={p.id}
                icon={Building2}
                title={p.name}
                subtitle={`${p.availableUnits} avail · ${p.soldUnits} sold · ${p.totalUnits} total`}
                meta={formatCurrency(toNum(p.totalAssetValue))}
                metaSub={`Rev ${formatCurrency(toNum(p.revenue))}`}
                tone="default"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

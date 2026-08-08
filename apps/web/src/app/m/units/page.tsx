import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Home } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileUnitsList } from "./MobileUnitsList";

/**
 * /m/units — mobile built-unit inventory. Replaces every desktop `/units`
 * link from the mobile surface. Grouped by availability status so a sales
 * user sees sellable stock first.
 */
export default function MobileUnitsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileUnitsContent />
    </Suspense>
  );
}

async function MobileUnitsContent() {
  await connection();
  const company = await getCompany();

  const units = await prisma.builtUnit.findMany({
    where: {
      deletedAt: null,
      project: { companyId: company.id, deletedAt: null },
    },
    orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
    take: 100,
    include: { project: { select: { id: true, name: true } } },
  });

  const byStatus = (s: string) => units.filter((u) => u.status === s);
  const available = [
    ...byStatus("AVAILABLE"),
    ...byStatus("PLANNED"),
    ...byStatus("UNDER_CONSTRUCTION"),
  ];
  const sold = byStatus("SOLD");
  const hold = byStatus("HOLD");
  const rented = byStatus("RENTED");

  const availableValue = available.reduce(
    (s, u) => s + toNum(u.askingPrice ?? u.currentValuation),
    0,
  );

  // Serialize for the client component (search + filter chips + badges)
  const serialized = units.map((u) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    unitType: u.unitType,
    status: u.status,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    projectId: u.project.id,
    projectName: u.project.name,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Units"
        subtitle={`${units.length} total · ${available.length} available`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Available" value={formatNumber(available.length, 0)} hint={formatCurrency(availableValue)} icon={Home} tone="success" />
        <MobileStatCard label="Sold" value={formatNumber(sold.length, 0)} icon={Home} />
        <MobileStatCard label="On Hold" value={formatNumber(hold.length, 0)} icon={Home} tone={hold.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Rented" value={formatNumber(rented.length, 0)} icon={Home} />
      </div>

      <MobileUnitsList items={serialized} />

      {units.length === 0 && (
        <>
          <MobileSectionTitle>Available</MobileSectionTitle>
          <MobileEmptyState
            icon={Home}
            title="No units yet"
            hint="Units show here once created from the desktop Setup"
          />
        </>
      )}
    </div>
  );
}

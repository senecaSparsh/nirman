import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { LandPlot } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileLandList, type LandListItem } from "./MobileLandList";

/**
 * /m/land — mobile land portfolio. Shows land purchases with their parcels,
 * grouped by status so a sales/owner user sees available land bank first.
 */
export default function MobileLandPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileLandContent />
    </Suspense>
  );
}

async function MobileLandContent() {
  await connection();
  const company = await getCompany();

  const [purchases, parcels] = await Promise.all([
    prisma.landPurchase.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sellerName: true,
        totalArea: true,
        areaUnit: true,
        totalCost: true,
        location: true,
        project: { select: { name: true } },
        _count: { select: { parcels: { where: { deletedAt: null } } } },
      },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId: company.id } },
      orderBy: [{ landPurchaseId: "asc" }, { number: "asc" }],
      take: 100,
      include: {
        landPurchase: { select: { sellerName: true } },
        project: { select: { name: true } },
        _count: { select: { children: true } },
      },
    }),
  ]);

  const available = parcels.filter((p) => p.status === "AVAILABLE");
  const sold = parcels.filter((p) => p.status === "SOLD");

  const totalValue = parcels.reduce((s, p) => s + toNum(p.currentValuation), 0);
  const totalArea = purchases.reduce((s, p) => s + toNum(p.totalArea), 0);

  // Serialize purchases + parcels for the client component (search + filter
  // chips + status badges). Parcels carry enough context to render rows and
  // search by seller name / location / parcel number.
  const serializedPurchases = purchases.map((p) => ({
    id: p.id,
    sellerName: p.sellerName,
    location: p.location,
    totalArea: toNum(p.totalArea),
    areaUnit: p.areaUnit,
    totalCost: toNum(p.totalCost),
    projectName: p.project?.name ?? null,
    parcelCount: p._count.parcels,
  }));

  const serializedParcels: LandListItem[] = parcels.map((p) => ({
    id: p.id,
    number: p.number,
    status: p.status,
    sellerName: p.landPurchase.sellerName,
    projectName: p.project?.name ?? null,
    landPurchaseId: p.landPurchaseId,
    askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
    currentValuation: toNum(p.currentValuation),
    childCount: p._count.children,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Land Parcels"
        subtitle={`${purchases.length} purchases · ${parcels.length} parcels`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Total Area"
          value={formatNumber(totalArea, 0)}
          hint={purchases[0]?.areaUnit ?? "SQFT"}
          icon={LandPlot}
        />
        <MobileStatCard
          label="Portfolio Value"
          value={formatCurrency(totalValue)}
          icon={LandPlot}
          tone="success"
        />
        <MobileStatCard
          label="Available"
          value={formatNumber(available.length, 0)}
          icon={LandPlot}
          tone="success"
        />
        <MobileStatCard
          label="Sold"
          value={formatNumber(sold.length, 0)}
          icon={LandPlot}
        />
      </div>

      <MobileSectionTitle>Land Purchases</MobileSectionTitle>
      {purchases.length === 0 ? (
        <MobileEmptyState
          icon={LandPlot}
          title="No land purchases"
          hint="Add land acquisitions from the desktop Build → Acquire section"
        />
      ) : (
        <div>
          {serializedPurchases.map((p) => (
            <MobileRow
              key={p.id}
              href={`/land/${p.id}`}
              icon={LandPlot}
              title={p.sellerName}
              subtitle={`${p.location ?? "No location"} · ${p.parcelCount} parcels${p.projectName ? ` · ${p.projectName}` : ""}`}
              meta={formatCurrency(p.totalCost)}
            />
          ))}
        </div>
      )}

      <MobileLandList items={serializedParcels} />
    </div>
  );
}

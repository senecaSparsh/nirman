import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { MapPin, IndianRupee, Layers, TrendingUp, FileText, Route } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileLandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileLandDetailContent params={params} />
    </Suspense>
  );
}

async function MobileLandDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const parcel = await prisma.landParcel.findFirst({
    where: { id, landPurchase: { companyId: company.id } },
    include: {
      landPurchase: { select: { id: true, purchaseNumber: true, project: { select: { name: true } } } },
      parentParcel: { select: { id: true, number: true } },
      childParcels: { orderBy: { number: "asc" } },
    },
  });

  if (!parcel) {
    return (
      <div>
        <MobileDetailHeader title="Land Parcel" backHref="/m/land" />
        <MobileEmptyState icon={MapPin} title="Parcel not found" />
      </div>
    );
  }

  return (
    <div>
      <MobileDetailHeader
        title={parcel.number}
        subtitle={parcel.landPurchase?.project?.name ?? "no project"}
        backHref="/m/land"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={MapPin} title="Status" value={parcel.status} />
        <MobileInfoRow icon={Layers} title="Area" value={`${formatNumber(toNum(parcel.area))} ${parcel.areaUnit}`} />
        {parcel.parentParcel && (
          <MobileInfoRow icon={FileText} title="Parent Parcel" value={parcel.parentParcel.number} />
        )}
        {parcel.isInfrastructure && (
          <MobileInfoRow icon={Route} title="Infrastructure" value="Non-saleable" />
        )}
      </div>

      <MobileSectionTitle>Valuation</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Acquisition Cost"
          value={formatCurrency(toNum(parcel.acquisitionCost))}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Current Valuation"
          value={formatCurrency(toNum(parcel.currentValuation))}
          icon={TrendingUp}
          tone="brand"
        />
        {parcel.askingPrice && (
          <MobileStatCard
            label="Asking Price"
            value={formatCurrency(toNum(parcel.askingPrice))}
            icon={IndianRupee}
            tone="warning"
          />
        )}
        {parcel.marketValue && (
          <MobileStatCard
            label="Market Value"
            value={formatCurrency(toNum(parcel.marketValue))}
            icon={IndianRupee}
          />
        )}
      </div>

      {parcel.childParcels.length > 0 && (
        <>
          <MobileSectionTitle>Child Parcels ({parcel.childParcels.length})</MobileSectionTitle>
          <div>
            {parcel.childParcels.map((child) => (
              <MobileRow
                key={child.id}
                href={`/m/land/${child.id}`}
                icon={MapPin}
                title={child.number}
                subtitle={`${formatNumber(toNum(child.area))} ${child.areaUnit} · ${formatCurrency(toNum(child.acquisitionCost))}`}
                badge={<MobileStatusBadge status={child.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

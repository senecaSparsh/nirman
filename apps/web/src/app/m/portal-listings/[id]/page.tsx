import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Globe, IndianRupee, Home, Calendar, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobilePortalListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePortalListingDetailContent params={params} />
    </Suspense>
  );
}

async function MobilePortalListingDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const listing = await prisma.portalListing.findFirst({
    where: { id, companyId: company.id },
    include: {
      builtUnit: { select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true } },
    },
  });

  if (!listing) {
    return (
      <div>
        <MobileDetailHeader title="Listing" backHref="/m/portal-listings" />
        <MobileEmptyState icon={Globe} title="Listing not found" />
      </div>
    );
  }

  return (
    <div>
      <MobileDetailHeader
        title={listing.title}
        subtitle={listing.portalName}
        backHref="/m/portal-listings"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Globe} title="Portal" value={listing.portalName} />
        <MobileInfoRow icon={CheckCircle2} title="Status" value={listing.status} />
        <MobileInfoRow icon={Calendar} title="Created" value={formatDate(listing.createdAt)} />
        {listing.listingUrl && (
          <MobileInfoRow icon={ExternalLink} title="Listing URL" value={listing.listingUrl} />
        )}
        {listing.syncError && (
          <MobileInfoRow icon={AlertTriangle} title="Sync Error" value={listing.syncError} />
        )}
      </div>

      <MobileSectionTitle>Pricing</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Asking Price"
          value={formatCurrency(toNum(listing.askingPrice))}
          icon={IndianRupee}
          tone="brand"
        />
        {listing.builtUnit && (
          <MobileStatCard
            label="Area"
            value={`${toNum(listing.builtUnit.area)} ${listing.builtUnit.areaUnit}`}
            icon={Home}
          />
        )}
      </div>

      {listing.builtUnit && (
        <>
          <MobileSectionTitle>Unit Details</MobileSectionTitle>
          <div>
            <MobileInfoRow icon={Home} title="Unit Number" value={listing.builtUnit.unitNumber} />
            <MobileInfoRow icon={Home} title="Type" value={listing.builtUnit.unitType} />
          </div>
        </>
      )}
    </div>
  );
}

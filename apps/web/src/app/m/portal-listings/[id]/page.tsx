import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Globe, IndianRupee, Home, Calendar, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobilePortalListingActions } from "./MobilePortalListingActions";

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
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={Globe} title="Listing not found" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
      </div>

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow icon={Globe} title="Portal" meta={listing.portalName} />
        <MobileRow icon={CheckCircle2} title="Status" meta={listing.status} />
        <MobileRow icon={Calendar} title="Created" meta={formatDate(listing.createdAt)} />
        {listing.listingUrl && (
          <MobileRow icon={ExternalLink} title="Listing URL" meta={listing.listingUrl} />
        )}
        {listing.syncError && (
          <MobileRow icon={AlertTriangle} title="Sync Error" meta={listing.syncError} />
        )}
      </div>

      <MobileSectionTitle>Pricing</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label="Asking Price"
          value={formatCurrency(toNum(listing.askingPrice))}
          icon={IndianRupee}
          tone="signal"
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
          <div className="flex flex-col gap-2.5">
            <MobileRow icon={Home} title="Unit Number" meta={listing.builtUnit.unitNumber} />
            <MobileRow icon={Home} title="Type" meta={listing.builtUnit.unitType} />
          </div>
        </>
      )}

      <MobilePortalListingActions listingId={listing.id} status={listing.status} />
    </div>
  );
}

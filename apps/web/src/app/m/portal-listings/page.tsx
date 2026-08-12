import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Globe } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import {
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobilePortalListingsList, type PortalListingItem } from "./MobilePortalListingsList";

/**
 * /m/portal-listings — mobile portal listing management. Sales users need
 * to see which units are listed on 99acres/MagicBricks/Housing and their
 * sync status while on the go.
 */
export default function MobilePortalListingsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePortalListingsContent />
    </Suspense>
  );
}

async function MobilePortalListingsContent() {
  await connection();
  const company = await getCompany();

  const listings = await prisma.portalListing.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      portalName: true,
      title: true,
      askingPrice: true,
      status: true,
      listingUrl: true,
      lastSyncedAt: true,
      syncError: true,
      builtUnit: { select: { unitNumber: true, project: { select: { name: true } } } },
    },
  });

  const rows: PortalListingItem[] = listings.map((l) => ({
    id: l.id,
    portalName: l.portalName,
    title: l.title,
    status: l.status,
    askingPrice: toNum(l.askingPrice),
    listingUrl: l.listingUrl,
    lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    syncError: l.syncError,
    unitNumber: l.builtUnit?.unitNumber ?? null,
    projectName: l.builtUnit?.project.name ?? null,
  }));

  const listed = rows.filter((l) => l.status === "LISTED");
  const draft = rows.filter((l) => l.status === "DRAFT");
  const failed = rows.filter((l) => l.status === "SYNC_FAILED");
  const delisted = rows.filter((l) => l.status === "DELISTED");

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Listed" value={String(listed.length)} icon={Globe} tone="go" />
        <MobileStatCard label="Draft" value={String(draft.length)} icon={Globe} />
        {failed.length > 0 && (
          <MobileStatCard label="Failed" value={String(failed.length)} icon={Globe} tone="stop" />
        )}
        <MobileStatCard label="Delisted" value={String(delisted.length)} icon={Globe} />
      </div>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={Globe}
          title="No portal listings"
          hint="Create portal listings from the desktop Sell → Portal Listings section"
        />
      ) : (
        <MobilePortalListingsList items={rows} />
      )}
    </div>
  );
}

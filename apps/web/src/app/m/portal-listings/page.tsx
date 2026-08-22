import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Globe, Plus } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobilePortalListingsList, type PortalListingItem } from "./MobilePortalListingsList";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.SALES_MANAGE);

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

  const csvColumns: MobileColumnSpec[] = [
    { key: "title", label: "Title" },
    { key: "portalName", label: "Portal" },
    { key: "projectName", label: "Project" },
    { key: "unitNumber", label: "Unit" },
    { key: "status", label: "Status" },
    { key: "askingPrice", label: "Asking Price", format: "currency" },
  ];

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

      <div className="mb-4">
        <MobileExportShareBar
          title="Portal Listings"
          rows={rows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`${rows.length} listings · ${listed.length} listed`}
        />
      </div>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={Globe}
          title="No portal listings"
          hint={canManage ? "Tap 'New Listing' to list a unit on 99acres, MagicBricks, etc." : "Portal listings will appear here once created"}
          action={
            canManage ? (
              <MobileCta href="/m/portal-listings/new" icon={Plus} variant="primary">
                New Listing
              </MobileCta>
            ) : undefined
          }
        />
      ) : (
        <>
          <MobilePortalListingsList items={rows} />
          {canManage && (
            <div className="mt-4">
              <MobileCta href="/m/portal-listings/new" icon={Plus} variant="primary">
                New Listing
              </MobileCta>
            </div>
          )}
        </>
      )}
    </div>
  );
}

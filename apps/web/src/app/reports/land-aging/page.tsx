import { Suspense } from "react";
import { connection } from "next/server";
import { getCompany, scopeWhere, getUserPermissions, toNum } from "@/lib/server";
import { prisma } from "@nirman/db";
import { unsoldLandAgingReport } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { Page } from "@/components/page";
import { LandAgingReport, type LandAgingRow } from "@/components/reports/land-aging-report";

/**
 * Land Aging report — unsold parcels by years-since-purchase. Land held for
 * years is capital parked: the point of trading land is to turn it, and a
 * 2+yr-old parcel usually means the price is wrong or the bet was.
 */
export default function LandAgingPage() {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading land aging…" variant="cards" />}>
        <LandAgingContent />
      </Suspense>
    </Page>
  );
}

async function LandAgingContent() {
  await connection();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.ASSETS_VIEW)) {
    return <NoAccess what="land aging" permission={PERM.ASSETS_VIEW} />;
  }
  const company = await getCompany();
  // Parcels scope through their land purchase's project — resolve allowed
  // landPurchase ids for project-scoped users.
  const lpScope = await scopeWhere("LandPurchase", {});
  const allowedIds =
    Object.keys(lpScope).length === 0
      ? null
      : new Set(
          (
            await prisma.landPurchase.findMany({
              where: { ...lpScope, companyId: company.id, deletedAt: null },
              select: { id: true },
            })
          ).map((l) => l.id),
        );

  const rows = await unsoldLandAgingReport(company.id);
  const scoped = allowedIds ? rows.filter((r: { landPurchaseId: string }) => allowedIds.has(r.landPurchaseId)) : rows;

  const mapped: LandAgingRow[] = scoped.map((r: {
    parcelNumber: string; location: string | null; projectName: string | null;
    sellerName: string | null; area: { toString(): string }; areaUnit: string;
    acquisitionCost: { toString(): string }; currentValuation: { toString(): string };
    askingPrice: { toString(): string } | null; purchaseDate: Date; ageYears: number;
    bucket: string; isStale: boolean; potentialLoss: { toString(): string };
  }) => ({
    parcelNumber: r.parcelNumber,
    location: r.location,
    projectName: r.projectName,
    sellerName: r.sellerName,
    area: toNum(r.area),
    areaUnit: r.areaUnit,
    acquisitionCost: toNum(r.acquisitionCost),
    currentValuation: toNum(r.currentValuation),
    askingPrice: r.askingPrice ? toNum(r.askingPrice) : null,
    purchaseDate: r.purchaseDate.toISOString(),
    ageYears: r.ageYears,
    bucket: r.bucket,
    isStale: r.isStale,
    potentialLoss: toNum(r.potentialLoss),
  }));

  return (
    <>
      <PageHeader
        title="Land Aging"
        description="Unsold parcels by years since purchase — stale land is capital parked, not inventory."
        stats={[
          { label: "Unsold parcels", value: mapped.length, hint: "AVAILABLE or HOLD parcels still on hand." },
          { label: "Held 2+ years", value: mapped.filter((r) => r.isStale).length, hint: "Parcels untouched for 2+ years — review the ask or the bet." },
        ]}
      />
      <LandAgingReport rows={mapped} />
    </>
  );
}

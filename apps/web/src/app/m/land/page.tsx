import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileLandList } from "./MobileLandList";

/**
 * /m/land — mobile land portfolio. Shows land purchases with parcel
 * breakdown, valuation, and sale status. Supervisors/owners need to
 * see what land they own, what's available to sell, and what's held.
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
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <div className="p-4 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
        No access to land parcels.
      </div>
    );
  }

  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);

  const purchases = await prisma.landPurchase.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      parcels: {
        where: { deletedAt: null },
        select: {
          id: true, number: true, status: true, area: true,
          acquisitionCost: true, currentValuation: true,
          askingPrice: true, parentParcelId: true,
          _count: { select: { children: true } },
        },
      },
    },
  });

  // Build portfolio stats
  const allParcels = purchases.flatMap((p) => p.parcels);
  const sellable = allParcels.filter((p) => p.status !== "PARTITIONED");
  const available = sellable.filter((p) => p.status === "AVAILABLE");
  const hold = sellable.filter((p) => p.status === "HOLD");
  const partitioned = allParcels.filter((p) => p.status === "PARTITIONED");
  const totalArea = purchases.reduce((s, p) => s + toNum(p.totalArea), 0);
  const unsoldValue = sellable.reduce((s, p) => s + toNum(p.currentValuation), 0);
  const costBasis = sellable.reduce((s, p) => s + toNum(p.acquisitionCost), 0);
  const availableArea = available.reduce((s, p) => s + toNum(p.area), 0);

  const serialized = purchases.map((lp) => {
    const parcels = lp.parcels;
    const sellableP = parcels.filter((p) => p.status !== "PARTITIONED");
    const availP = sellableP.filter((p) => p.status === "AVAILABLE");
    const holdP = sellableP.filter((p) => p.status === "HOLD");
    const partP = parcels.filter((p) => p.status === "PARTITIONED");
    const unsoldVal = sellableP.reduce((s, p) => s + toNum(p.currentValuation), 0);
    const costBasis = sellableP.reduce((s, p) => s + toNum(p.acquisitionCost), 0);

    return {
      id: lp.id,
      sellerName: lp.sellerName,
      sellerContact: lp.sellerContact,
      purchaseDate: lp.purchaseDate.toISOString(),
      totalArea: toNum(lp.totalArea),
      areaUnit: lp.areaUnit,
      totalCost: toNum(lp.totalCost),
      registryNo: lp.registryNo,
      location: lp.location,
      projectId: lp.projectId,
      projectName: lp.project?.name ?? null,
      parcelCount: sellableP.length,
      availableCount: availP.length,
      holdCount: holdP.length,
      partitionedCount: partP.length,
      availableArea: availP.reduce((s, p) => s + toNum(p.area), 0),
      unsoldValue: unsoldVal,
      costBasis,
      valuationGain: unsoldVal - costBasis,
      parcels: parcels.map((p) => ({
        id: p.id,
        number: p.number,
        status: p.status,
        area: toNum(p.area),
        currentValuation: toNum(p.currentValuation),
        askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
        parentParcelId: p.parentParcelId,
        childCount: p._count.children,
      })),
    };
  });

  return (
    <MobileLandList
      items={serialized}
      portfolio={{
        purchaseCount: purchases.length,
        totalArea,
        areaUnit: purchases[0]?.areaUnit ?? "SQFT",
        parcelCount: sellable.length,
        availableCount: available.length,
        holdCount: hold.length,
        partitionedCount: partitioned.length,
        availableArea,
        unsoldValue,
        costBasis,
      }}
      canManage={canManage}
    />
  );
}

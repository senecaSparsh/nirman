import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { MobileLandDetailClient } from "./MobileLandDetailClient";

/**
 * /m/land/[id] — mobile land purchase detail. Shows the purchase record,
 * parcel breakdown with per-parcel actions (partition, sell, hold, valuate),
 * and sales history. Designed for field use: supervisors checking what land
 * is available, managers approving sales/partitions.
 */
export default function MobileLandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading land purchase…" />}>
      <MobileLandDetailContent params={params} />
    </Suspense>
  );
}

async function MobileLandDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const role = await getUserRole();
  const company = await getCompany();

  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);
  const canPartition = hasPermission(role, PERM.LAND_PARTITION);
  const canSell = hasPermission(role, PERM.SALE_CREATE);

  const purchase = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      project: { select: { id: true, name: true } },
      parcels: {
        where: { deletedAt: null },
        orderBy: [{ number: "asc" }],
        include: {
          parentParcel: { select: { number: true } },
          _count: { select: { children: true } },
        },
      },
    },
  });

  if (!purchase) {
    return (
      <MobileLandDetailClient
        notFound
        canManage={canManage}
        canPartition={canPartition}
        canSell={canSell}
        customers={[]}
      />
    );
  }

  const parcelIds = purchase.parcels.map((p) => p.id);
  const [landSales, customers, parcelBuiltUnits] = await Promise.all([
    prisma.assetSale.findMany({
      where: { landParcelId: { in: parcelIds }, assetType: "LAND", status: "ACTIVE" },
      select: {
        id: true, saleNumber: true, salePrice: true, profit: true, saleDate: true,
        landParcelId: true, paymentStatus: true, saleStage: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Built units linked to parcels (subdivided inventory — flats/shops built on the land)
    prisma.builtUnit.findMany({
      where: { landParcelId: { in: parcelIds }, deletedAt: null },
      select: {
        id: true, unitNumber: true, unitType: true, status: true,
        area: true, areaUnit: true, floor: true, wing: true,
        originType: true, acquisitionCost: true, productionCost: true,
        askingPrice: true, currentValuation: true,
        landParcelId: true, projectId: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ unitNumber: "asc" }],
    }),
  ]);

  const saleByParcel = new Map(
    landSales.map((s) => [s.landParcelId!, {
      salePrice: toNum(s.salePrice),
      saleProfit: toNum(s.profit),
      saleNumber: s.saleNumber,
      saleDate: s.saleDate.toISOString(),
      paymentStatus: s.paymentStatus,
      saleStage: s.saleStage,
      customerName: s.customer.name,
    }]),
  );

  const parcels = purchase.parcels.map((p) => {
    const sale = saleByParcel.get(p.id);
    return {
      id: p.id,
      number: p.number,
      status: p.status,
      area: toNum(p.area),
      areaUnit: p.areaUnit,
      acquisitionCost: toNum(p.acquisitionCost),
      askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
      currentValuation: toNum(p.currentValuation),
      parentParcelId: p.parentParcelId,
      parentParcelNumber: p.parentParcel?.number ?? null,
      isInfrastructure: p.isInfrastructure,
      childCount: p._count.children,
      salePrice: sale?.salePrice ?? null,
      saleProfit: sale?.saleProfit ?? null,
      saleNumber: sale?.saleNumber ?? null,
      saleDate: sale?.saleDate ?? null,
      saleStage: sale?.saleStage ?? null,
      customerName: sale?.customerName ?? null,
    };
  });

  const sellable = parcels.filter((p) => p.status !== "PARTITIONED");
  const sold = sellable.filter((p) => p.salePrice != null);
  const unsold = sellable.filter((p) => p.salePrice == null);
  const unsoldValue = unsold.reduce((s, p) => s + p.currentValuation, 0);
  const costBasis = unsold.reduce((s, p) => s + p.acquisitionCost, 0);
  const soldRevenue = sold.reduce((s, p) => s + (p.salePrice ?? p.currentValuation), 0);
  const soldProfit = sold.reduce((s, p) => s + (p.saleProfit ?? 0), 0);
  const availableArea = unsold.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + p.area, 0);
  const totalAreaNum = toNum(purchase.totalArea);
  const costPerUnit = totalAreaNum > 0 ? toNum(purchase.totalCost) / totalAreaNum : 0;

  const data = {
    id: purchase.id,
    sellerName: purchase.sellerName,
    sellerContact: purchase.sellerContact,
    purchaseDate: purchase.purchaseDate.toISOString(),
    totalArea: toNum(purchase.totalArea),
    areaUnit: purchase.areaUnit,
    totalCost: toNum(purchase.totalCost),
    registryNo: purchase.registryNo,
    location: purchase.location,
    documentUrl: purchase.documentUrl,
    projectId: purchase.projectId,
    projectName: purchase.project?.name ?? null,
    costPerUnit,
    parcels,
    sales: landSales.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      salePrice: toNum(s.salePrice),
      profit: toNum(s.profit),
      saleDate: s.saleDate.toISOString(),
      paymentStatus: s.paymentStatus,
      saleStage: s.saleStage,
      parcelNumber: purchase.parcels.find((p) => p.id === s.landParcelId)?.number ?? "—",
      customerName: s.customer.name,
    })),
    builtUnits: parcelBuiltUnits.map((u) => {
      const parcel = purchase.parcels.find((p) => p.id === u.landParcelId);
      return {
        id: u.id,
        unitNumber: u.unitNumber,
        unitType: u.unitType,
        status: u.status,
        area: toNum(u.area),
        areaUnit: u.areaUnit,
        floor: u.floor,
        wing: u.wing,
        originType: u.originType,
        acquisitionCost: toNum(u.acquisitionCost),
        productionCost: toNum(u.productionCost),
        askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
        currentValuation: toNum(u.currentValuation),
        landParcelId: u.landParcelId!,
        landParcelNumber: parcel?.number ?? null,
        projectName: u.project.name,
      };
    }),
    stats: {
      parcelCount: sellable.length,
      availableCount: unsold.filter((p) => p.status === "AVAILABLE").length,
      holdCount: unsold.filter((p) => p.status === "HOLD").length,
      soldCount: sold.length,
      partitionedCount: parcels.filter((p) => p.status === "PARTITIONED").length,
      availableArea,
      unsoldValue,
      costBasis,
      valuationGain: unsoldValue - costBasis,
      soldRevenue,
      soldProfit,
    },
  };

  return (
    <MobileLandDetailClient
      data={data}
      canManage={canManage}
      canPartition={canPartition}
      canSell={canSell}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}

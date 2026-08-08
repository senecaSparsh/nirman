import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { LandView } from "@/components/land/land-view";
import { PageLoading } from "@/components/page-loading";
import type {
  LandPurchaseRow, LandParcelRow, LandParcelSummary, LandPortfolio, ProjectOption,
} from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function LandPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading land…" variant="cards" />}>
        <LandContent />
      </Suspense>
    </div>
  );
}

async function LandContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <NoAccess what="land parcels" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.ASSETS_MANAGE),
    canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
    canPartition: hasPermission(role, PERM.LAND_PARTITION),
    canSell: hasPermission(role, PERM.SALE_CREATE),
  };

  // Fetch purchases, parcels, projects, land sales, and customers (for sell dialog).
  const [purchases, parcels, projects, landSales, customers] = await Promise.all([
    prisma.landPurchase.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        parcels: {
          where: { deletedAt: null },
          select: {
            id: true, number: true, status: true, area: true,
            acquisitionCost: true, currentValuation: true, geometry: true,
            parentParcelId: true, _count: { select: { children: true } },
          },
        },
      },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId: company.id } },
      orderBy: [{ landPurchaseId: "asc" }, { number: "asc" }],
      include: {
        project: { select: { name: true } },
        parentParcel: { select: { number: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, assetType: "LAND", status: "ACTIVE" },
      select: {
        id: true, saleNumber: true, salePrice: true, profit: true, saleDate: true,
        landParcelId: true, customer: { select: { name: true } },
      },
    }),
    // Customer has no companyId — scope to customers with sales in this company.
    prisma.customer.findMany({
      where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Map sale info by landParcelId for quick lookup.
  const saleByParcel = new Map(
    landSales.map((s) => [s.landParcelId!, {
      salePrice: toNum(s.salePrice),
      saleProfit: toNum(s.profit),
      saleNumber: s.saleNumber,
      saleDate: s.saleDate.toISOString(),
      customerName: s.customer.name,
    }]),
  );

  // ── Build purchase rows with per-purchase aggregates ──
  const purchaseRows: LandPurchaseRow[] = purchases.map((lp) => {
    const parcelSummaries: LandParcelSummary[] = lp.parcels.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      area: toNum(p.area),
      acquisitionCost: toNum(p.acquisitionCost),
      currentValuation: toNum(p.currentValuation),
      parentParcelId: p.parentParcelId,
      childCount: p._count.children,
      geometry: p.geometry,
    }));

    const sold = parcelSummaries.filter((p) => p.status === "SOLD");
    const unsold = parcelSummaries.filter((p) => p.status === "AVAILABLE" || p.status === "HOLD");

    const soldRevenue = sold.reduce((s, p) => s + (saleByParcel.get(p.id)?.salePrice ?? p.currentValuation), 0);
    const soldProfit = sold.reduce((s, p) => s + (saleByParcel.get(p.id)?.saleProfit ?? 0), 0);
    const unsoldValue = unsold.reduce((s, p) => s + p.currentValuation, 0);
    const costBasis = unsold.reduce((s, p) => s + p.acquisitionCost, 0);

    return {
      id: lp.id,
      projectId: lp.projectId,
      projectName: lp.project?.name ?? null,
      sellerName: lp.sellerName,
      sellerContact: lp.sellerContact,
      purchaseDate: lp.purchaseDate.toISOString(),
      totalArea: toNum(lp.totalArea),
      areaUnit: lp.areaUnit,
      totalCost: toNum(lp.totalCost),
      registryNo: lp.registryNo,
      location: lp.location,
      parcelCount: parcelSummaries.length,
      availableArea: parcelSummaries
        .filter((p) => p.status === "AVAILABLE")
        .reduce((s, p) => s + p.area, 0),
      parcels: parcelSummaries,
      soldCount: sold.length,
      soldRevenue,
      soldProfit,
      availableCount: parcelSummaries.filter((p) => p.status === "AVAILABLE").length,
      holdCount: parcelSummaries.filter((p) => p.status === "HOLD").length,
      partitionedCount: parcelSummaries.filter((p) => p.status === "PARTITIONED").length,
      unsoldValue,
      costBasis,
      valuationGain: unsoldValue - costBasis,
      hasChildren: parcelSummaries.some((p) => p.parentParcelId !== null),
    };
  });

  // ── Build parcel rows (flat, with sale info for SOLD) ──
  const parcelRows: LandParcelRow[] = parcels.map((p) => {
    const sale = p.status === "SOLD" ? saleByParcel.get(p.id) : undefined;
    return {
      id: p.id,
      landPurchaseId: p.landPurchaseId,
      parentParcelId: p.parentParcelId,
      parentParcelNumber: p.parentParcel?.number ?? null,
      number: p.number,
      area: toNum(p.area),
      areaUnit: p.areaUnit,
      status: p.status,
      acquisitionCost: toNum(p.acquisitionCost),
      askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
      currentValuation: toNum(p.currentValuation),
      isInfrastructure: p.isInfrastructure,
      marketValue: p.marketValue ? toNum(p.marketValue) : null,
      weightFactor: p.weightFactor ? toNum(p.weightFactor) : null,
      projectId: p.projectId,
      projectName: p.project?.name ?? null,
      geometry: p.geometry,
      childCount: p._count.children,
      salePrice: sale?.salePrice ?? null,
      saleProfit: sale?.saleProfit ?? null,
      saleNumber: sale?.saleNumber ?? null,
      saleDate: sale?.saleDate ?? null,
      customerName: sale?.customerName ?? null,
    };
  });

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  // ── All parcel summaries (for the portfolio cadastre band) ──
  const allParcelSummaries: LandParcelSummary[] = parcelRows.map((p) => ({
    id: p.id,
    number: p.number,
    status: p.status,
    area: p.area,
    acquisitionCost: p.acquisitionCost,
    currentValuation: p.currentValuation,
    parentParcelId: p.parentParcelId,
    childCount: p.childCount,
    geometry: p.geometry,
  }));

  // ── Company-wide portfolio rollup ──
  const unsoldParcels = parcelRows.filter((p) => p.status === "AVAILABLE" || p.status === "HOLD");
  const soldParcels = parcelRows.filter((p) => p.status === "SOLD");
  const portfolio: LandPortfolio = {
    purchaseCount: purchaseRows.length,
    totalArea: purchaseRows.reduce((s, p) => s + p.totalArea, 0),
    parcelCount: parcelRows.length,
    availableCount: parcelRows.filter((p) => p.status === "AVAILABLE").length,
    holdCount: parcelRows.filter((p) => p.status === "HOLD").length,
    soldCount: soldParcels.length,
    partitionedCount: parcelRows.filter((p) => p.status === "PARTITIONED").length,
    availableArea: parcelRows.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + p.area, 0),
    costBasis: unsoldParcels.reduce((s, p) => s + p.acquisitionCost, 0),
    unsoldValue: unsoldParcels.reduce((s, p) => s + p.currentValuation, 0),
    unrealizedGain: 0,
    soldRevenue: soldParcels.reduce((s, p) => s + (p.salePrice ?? p.currentValuation), 0),
    soldProfit: soldParcels.reduce((s, p) => s + (p.saleProfit ?? 0), 0),
    totalValue: 0,
  };
  portfolio.unrealizedGain = portfolio.unsoldValue - portfolio.costBasis;
  portfolio.totalValue = portfolio.unsoldValue + portfolio.soldRevenue;

  return (
    <>
      <PageHeader
        title="Land"
        description="Land acquisitions, parcel subdivision, valuation, and sales."
      />
      <LandView
        purchases={purchaseRows}
        parcels={parcelRows}
        parcelSummaries={allParcelSummaries}
        projects={projectOptions}
        portfolio={portfolio}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        permissions={perms}
      />
    </>
  );
}

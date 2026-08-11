import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { LandView } from "@/components/land/land-view";
import { PageLoading } from "@/components/page-loading";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type {
  LandPurchaseRow, LandParcelRow, LandParcelSummary, LandPortfolio, ProjectOption,
} from "@/lib/types";

/**
 * /m/land — mobile land page. Uses the EXACT same desktop components
 * (PageHeader + LandView with DataTable) wrapped in .mobile-scale to
 * shrink all text to 9-11px. Layout is identical to desktop.
 */
export default function MobileLandPage() {
  return (
    <div className="mobile-scale px-3 py-4">
      <Suspense fallback={<PageLoading label="Loading land…" variant="cards" />}>
        <MobileLandContent />
      </Suspense>
    </div>
  );
}

async function MobileLandContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <div className="p-4 text-caption text-muted-foreground">No access to land parcels.</div>;
  }

  const perms = {
    canCreate: hasPermission(role, PERM.ASSETS_MANAGE),
    canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
    canPartition: hasPermission(role, PERM.LAND_PARTITION),
    canSell: hasPermission(role, PERM.SALE_CREATE),
  };

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
    prisma.customer.findMany({
      where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const saleByParcel = new Map(
    landSales.map((s) => [s.landParcelId!, {
      salePrice: toNum(s.salePrice),
      saleProfit: toNum(s.profit),
      saleNumber: s.saleNumber,
      saleDate: s.saleDate.toISOString(),
      customerName: s.customer.name,
    }]),
  );

  const purchaseRows: LandPurchaseRow[] = purchases.map((lp) => {
    const allParcels: LandParcelSummary[] = lp.parcels.map((p) => ({
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
    const parcelSummaries = allParcels.filter((p) => p.status !== "PARTITIONED");
    const sold = parcelSummaries.filter((p) => saleByParcel.has(p.id));
    const unsold = parcelSummaries.filter((p) => !saleByParcel.has(p.id));
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
      documentUrl: lp.documentUrl,
      parcelCount: parcelSummaries.length,
      availableArea: unsold
        .filter((p) => p.status === "AVAILABLE")
        .reduce((s, p) => s + p.area, 0),
      parcels: parcelSummaries,
      soldCount: sold.length,
      soldRevenue,
      soldProfit,
      availableCount: unsold.filter((p) => p.status === "AVAILABLE").length,
      holdCount: unsold.filter((p) => p.status === "HOLD").length,
      partitionedCount: allParcels.filter((p) => p.status === "PARTITIONED").length,
      unsoldValue,
      costBasis,
      valuationGain: unsoldValue - costBasis,
      hasChildren: allParcels.some((p) => p.parentParcelId !== null),
    };
  });

  const parcelRows: LandParcelRow[] = parcels.map((p) => {
    const sale = saleByParcel.get(p.id);
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

  const sellableParcels = parcelRows.filter((p) => p.status !== "PARTITIONED");
  const soldParcels = sellableParcels.filter((p) => p.salePrice != null);
  const unsoldParcels = sellableParcels.filter((p) => p.salePrice == null);
  const portfolio: LandPortfolio = {
    purchaseCount: purchaseRows.length,
    totalArea: purchaseRows.reduce((s, p) => s + p.totalArea, 0),
    parcelCount: sellableParcels.length,
    availableCount: unsoldParcels.filter((p) => p.status === "AVAILABLE").length,
    holdCount: unsoldParcels.filter((p) => p.status === "HOLD").length,
    soldCount: soldParcels.length,
    partitionedCount: parcelRows.filter((p) => p.status === "PARTITIONED").length,
    availableArea: unsoldParcels.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + p.area, 0),
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
    <div className="space-y-5">
      <PageHeader
        title="Land"
        description="Land acquisitions, parcel subdivision, valuation, and sales."
        stats={[
          { label: "Area", value: `${formatNumber(portfolio.totalArea, 0)} ${parcelRows[0]?.areaUnit ?? "sqft"}`, hint: "Total area across all land purchases." },
          { label: "Parcels", value: sellableParcels.length, hint: "Sellable parcels only — partitioned parents are excluded." },
          { label: "Available", value: portfolio.availableCount, tone: portfolio.availableCount > 0 ? "success" as const : "muted" as const, hint: "Parcels ready to sell." },
          { label: "Held", value: formatCurrency(portfolio.unsoldValue), hint: "Current valuation of all unsold parcels." },
          ...(portfolio.soldRevenue > 0 ? [
            { label: "Sold", value: formatCurrency(portfolio.soldRevenue), hint: "Total revenue from parcels already sold." },
          ] : []),
        ]}
      />
      <LandView
        purchases={purchaseRows}
        parcels={parcelRows}
        projects={projectOptions}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        permissions={perms}
        hidePlanColumn
        compactActions
        mobileToggle
      />
    </div>
  );
}

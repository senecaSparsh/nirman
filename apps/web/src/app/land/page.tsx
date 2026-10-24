import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, scopeWhere, getEffectivePermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { LandView } from "@/components/land/land-view";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PageLoading } from "@/components/page-loading";
import type {
  LandPurchaseRow, LandParcelRow, LandParcelSummary, LandPortfolio, ProjectOption,
} from "@/lib/types";

import { NoAccess } from "@/components/no-access";
import { DepartmentActivityFeed } from "@/components/department-activity-feed";
export default function LandPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading land…" variant="cards" />}>
        <LandContent />
      </Suspense>
    </div>
  );
}

async function LandContent() {
  await connection();
  const __effPerms = await getEffectivePermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.ASSETS_VIEW)) {
    return (
      <NoAccess what="land parcels" permission={PERM.ASSETS_VIEW} />
    );
  }

  const perms = {
    canCreate: __effPerms.includes(PERM.ASSETS_MANAGE),
    canEdit: __effPerms.includes(PERM.ASSETS_MANAGE),
    canPartition: __effPerms.includes(PERM.LAND_PARTITION),
    canSell: __effPerms.includes(PERM.SALE_CREATE),
  };

  // Fetch purchases, parcels, projects, land sales, and customers (for sell dialog).
  const cappedLabels: string[] = [];
  const capQ = (label: string, cap = LIST_CAP) => <T,>(rows: T[]): T[] => {
    const r = applyCap(rows, cap);
    if (r.capped) cappedLabels.push(label);
    return r.rows;
  };
  const parcelWhere = {...await scopeWhere("LandParcel"),  deletedAt: null, landPurchase: { companyId: company.id } } as const;
  const unsoldSellableWhere = {
    ...parcelWhere,
    status: { not: "PARTITIONED" as const },
    assetSales: { none: { status: "ACTIVE" as const } },
  };
  const [purchases, parcels, projects, landSales, customers, sellers, purchaseAgg, parcelStatusAgg, unsoldAgg, landSaleAgg] = await Promise.all([
    prisma.landPurchase.findMany({
      take: LIST_CAP + 1,
      where: {...await scopeWhere("LandPurchase"),  companyId: company.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        parcels: {
          where: { deletedAt: null },
          select: {
            id: true, number: true, status: true, area: true, purpose: true,
            acquisitionCost: true, currentValuation: true, geometry: true,
            parentParcelId: true, _count: { select: { children: true } },
          },
        },
        payments: { select: { id: true, amount: true, paymentMode: true, chequeStatus: true, status: true } },
      },
    }).then(capQ("land purchases")),
    prisma.landParcel.findMany({
      take: LIST_CAP + 1,
      where: {...await scopeWhere("LandParcel"),  deletedAt: null, landPurchase: { companyId: company.id } },
      orderBy: [{ landPurchaseId: "asc" }, { number: "asc" }],
      include: {
        project: { select: { name: true } },
        parentParcel: { select: { number: true } },
        _count: { select: { children: true } },
      },
    }).then(capQ("land parcels")),
    prisma.project.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }).then(capQ("projects", 200)),
    prisma.assetSale.findMany({
      take: 201,
      where: {...await scopeWhere("AssetSale"),  companyId: company.id, assetType: "LAND", status: "ACTIVE" },
      select: {
        id: true, saleNumber: true, salePrice: true, profit: true, saleDate: true,
        landParcelId: true, customer: { select: { name: true } },
      },
    }).then(capQ("land sales", 200)),
    // Customer has no companyId — scope to customers with sales in this company.
    prisma.customer.findMany({
      take: 201,
      where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }).then(capQ("customers", 200)),
    prisma.landSeller.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }).then(capQ("land sellers", 200)),
    // Portfolio aggregates — the lists above are capped for display, so the
    // header stats must come from complete aggregates, not row counts.
    prisma.landPurchase.aggregate({
      where: {...await scopeWhere("LandPurchase"),  companyId: company.id, deletedAt: null },
      _count: true,
      _sum: { totalArea: true },
    }),
    prisma.landParcel.groupBy({
      by: ["status"],
      where: parcelWhere,
      _count: true,
    }),
    prisma.landParcel.groupBy({
      by: ["status"],
      where: unsoldSellableWhere,
      _count: true,
      _sum: { area: true, acquisitionCost: true, currentValuation: true },
    }),
    prisma.assetSale.aggregate({
      where: {...await scopeWhere("AssetSale"),  companyId: company.id, assetType: "LAND", status: "ACTIVE" },
      _count: true,
      _sum: { salePrice: true, profit: true },
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
  // Partitioned parents are containers, not sellable units — exclude them
  // from the parcel list so every downstream consumer (drawer, table counts,
  // cadastre plan) shows only real parcels automatically.
  const purchaseRows: LandPurchaseRow[] = purchases.map((lp) => {
    const allParcels: LandParcelSummary[] = lp.parcels.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      purpose: p.purpose,
      area: toNum(p.area),
      acquisitionCost: toNum(p.acquisitionCost),
      currentValuation: toNum(p.currentValuation),
      parentParcelId: p.parentParcelId,
      childCount: p._count.children,
      geometry: p.geometry,
    }));
    // Sellable parcels = everything except PARTITIONED parents
    const parcelSummaries = allParcels.filter((p) => p.status !== "PARTITIONED");

    // "Sold" = has an active sale (parcel may still be HOLD/RESERVED during
    // the staged sale flow: PENDING → DEPOSIT_RECEIVED → COMPLETED).
    const sold = parcelSummaries.filter((p) => saleByParcel.has(p.id));
    const unsold = parcelSummaries.filter((p) => !saleByParcel.has(p.id));

    const soldRevenue = sold.reduce((s, p) => s + toNum((saleByParcel.get(p.id)?.salePrice ?? p.currentValuation)), 0);
    const soldProfit = sold.reduce((s, p) => s + toNum((saleByParcel.get(p.id)?.saleProfit ?? 0)), 0);
    const unsoldValue = unsold.reduce((s, p) => s + toNum(p.currentValuation), 0);
    const costBasis = unsold.reduce((s, p) => s + toNum(p.acquisitionCost), 0);

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
      mode: lp.mode,
      // Staged purchase
      purchaseStage: lp.purchaseStage,
      tokenAmount: lp.tokenAmount ? toNum(lp.tokenAmount) : null,
      tokenPaymentDate: lp.tokenPaymentDate ? lp.tokenPaymentDate.toISOString() : null,
      tokenPaymentMode: lp.tokenPaymentMode,
      // Possession
      isPossessed: lp.isPossessed,
      possessionDate: lp.possessionDate?.toISOString() ?? null,
      // Documents
      atsDocumentUrl: lp.atsDocumentUrl,
      atsDocumentName: lp.atsDocumentName,
      registryDocumentUrl: lp.registryDocumentUrl,
      registryDocumentName: lp.registryDocumentName,
      // Payments
      totalPaid: (lp.payments ?? []).reduce((s, p) => (p.status === "VOID" || p.chequeStatus === "BOUNCED" || p.chequeStatus === "PENDING") ? s : s + toNum(p.amount), 0),
      paymentCount: (lp.payments ?? []).length,
      parcelCount: parcelSummaries.length,
      availableArea: unsold
        .filter((p) => p.status === "AVAILABLE")
        .reduce((s, p) => s + toNum(p.area), 0),
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

  // ── Build parcel rows (flat, with sale info attached regardless of status) ──
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
      purpose: p.purpose,
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

  // ── Company-wide portfolio rollup ──
  // Partitioned parents are containers, not sellable units — exclude them from
  // counts and valuations so subdividing 1 plot into 3 shows 3, not 4.
  // Stats come from the complete aggregates above (lists are capped at 500).
  const allStatus = new Map(parcelStatusAgg.map((g) => [g.status, g._count]));
  const unsoldStatus = new Map(unsoldAgg.map((g) => [g.status, g]));
  const allCount = parcelStatusAgg.reduce((s, g) => s + g._count, 0);
  const partitioned = allStatus.get("PARTITIONED") ?? 0;
  const portfolio: LandPortfolio = {
    purchaseCount: purchaseAgg._count,
    totalArea: toNum(purchaseAgg._sum.totalArea),
    parcelCount: allCount - partitioned,
    availableCount: unsoldStatus.get("AVAILABLE")?._count ?? 0,
    holdCount: unsoldStatus.get("HOLD")?._count ?? 0,
    soldCount: landSaleAgg._count,
    partitionedCount: partitioned,
    availableArea: toNum(unsoldStatus.get("AVAILABLE")?._sum.area),
    costBasis: unsoldAgg.reduce((s, g) => s + toNum(g._sum.acquisitionCost), 0),
    unsoldValue: unsoldAgg.reduce((s, g) => s + toNum(g._sum.currentValuation), 0),
    unrealizedGain: 0,
    soldRevenue: toNum(landSaleAgg._sum.salePrice),
    soldProfit: toNum(landSaleAgg._sum.profit),
    totalValue: 0,
  };
  portfolio.unrealizedGain = portfolio.unsoldValue - portfolio.costBasis;
  portfolio.totalValue = portfolio.unsoldValue + portfolio.soldRevenue;

  return (
    <>
      <PageHeader
        title="Land"
        description="Land acquisitions, parcel subdivision, valuation, and sales."
        stats={[
          { label: "Area", value: `${formatNumber(portfolio.totalArea, 0)} ${parcelRows[0]?.areaUnit ?? "sqft"}`, hint: "Total area across all land purchases." },
          { label: "Parcels", value: portfolio.parcelCount, hint: "Sellable parcels only — partitioned parents are excluded. A whole plot counts as 1; after subdivision it counts as the number of sub-plots." },
          { label: "Available", value: portfolio.availableCount, tone: portfolio.availableCount > 0 ? "success" as const : "muted" as const, hint: "Parcels ready to sell — not on hold, not sold, not partitioned." },
          { label: "Unsold value", value: formatCurrency(portfolio.unsoldValue), hint: "Current valuation of all unsold parcels (available + on hold). This is what the land is worth on paper today." },
          { label: "Unrealized", value: `${portfolio.unrealizedGain >= 0 ? "+" : ""}${formatCurrency(portfolio.unrealizedGain)}`, tone: portfolio.unrealizedGain >= 0 ? "success" as const : "danger" as const, hint: "Paper gain on land you still hold = current valuation − acquisition cost. Not booked until sold." },
          ...(portfolio.soldRevenue > 0 ? [
            { label: "Sold", value: formatCurrency(portfolio.soldRevenue), hint: "Total revenue from parcels already sold." },
            { label: "Realized", value: `${portfolio.soldProfit >= 0 ? "+" : ""}${formatCurrency(portfolio.soldProfit)}`, tone: portfolio.soldProfit >= 0 ? "success" as const : "danger" as const, hint: "Actual profit from sold parcels = sale price − acquisition cost. This is booked." },
          ] : []),
        ]}
      />
      <DepartmentActivityFeed department="land" />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <LandView
        purchases={purchaseRows}
        parcels={parcelRows}
        projects={projectOptions}
        sellers={sellers.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        permissions={perms}
      />
    </>
  );
}

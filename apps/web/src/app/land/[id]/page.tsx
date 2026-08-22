import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { LandHub, type LandHubData } from "@/components/land/land-hub";
import type { LandParcelRow, LandParcelSummary, ProjectOption } from "@/lib/types";

export default function LandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading land purchase…" />}>
      <LandDetailContent params={params} />
    </Suspense>
  );
}

async function LandDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const role = await getUserRole();
  const company = await getCompany();

  const purchase = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      project: { select: { id: true, name: true, type: true, status: true } },
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
  if (!purchase) notFound();

  // Land sales for this purchase's parcels
  const parcelIds = purchase.parcels.map((p) => p.id);
  const [landSales, customers, parcelBuiltUnits, legalDocs] = await Promise.all([
    prisma.assetSale.findMany({
      where: { landParcelId: { in: parcelIds }, assetType: "LAND", status: "ACTIVE" },
      select: {
        id: true, saleNumber: true, salePrice: true, profit: true, saleDate: true,
        landParcelId: true, paymentStatus: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Built units linked to parcels (subdivided inventory)
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
    // Legal documents for this land purchase
    prisma.legalDocument.findMany({
      where: { landPurchaseId: purchase.id, companyId: company.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  const saleByParcel = new Map(
    landSales.map((s) => [s.landParcelId!, {
      salePrice: toNum(s.salePrice),
      saleProfit: toNum(s.profit),
      saleNumber: s.saleNumber,
      saleDate: s.saleDate.toISOString(),
      paymentStatus: s.paymentStatus,
      customerName: s.customer.name,
    }]),
  );

  const parcelRows: LandParcelRow[] = purchase.parcels.map((p) => {
    // Attach sale info regardless of parcel status — the sale service uses a
    // staged flow (PENDING → DEPOSIT_RECEIVED → COMPLETED), so a parcel with
    // an active sale may still be HOLD/RESERVED, not SOLD.
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
      projectName: purchase.project?.name ?? null,
      geometry: p.geometry,
      childCount: p._count.children,
      salePrice: sale?.salePrice ?? null,
      saleProfit: sale?.saleProfit ?? null,
      saleNumber: sale?.saleNumber ?? null,
      saleDate: sale?.saleDate ?? null,
      customerName: sale?.customerName ?? null,
    };
  });

  const parcelSummaries: LandParcelSummary[] = parcelRows.map((p) => ({
    id: p.id, number: p.number, status: p.status, area: p.area,
    acquisitionCost: p.acquisitionCost, currentValuation: p.currentValuation,
    parentParcelId: p.parentParcelId, childCount: p.childCount,
    geometry: p.geometry,
  }));

  // Sellable parcels exclude PARTITIONED parents (containers, not units).
  // "Sold" = has an active sale (regardless of parcel status, which may still
  // be HOLD/RESERVED during the staged sale flow).
  const sellable = parcelRows.filter((p) => p.status !== "PARTITIONED");
  const sold = sellable.filter((p) => p.salePrice != null);
  const unsold = sellable.filter((p) => p.salePrice == null);
  const unsoldValue = unsold.reduce((s, p) => s + p.currentValuation, 0);
  const costBasis = unsold.reduce((s, p) => s + p.acquisitionCost, 0);
  const soldRevenue = sold.reduce((s, p) => s + (p.salePrice ?? p.currentValuation), 0);
  const soldProfit = sold.reduce((s, p) => s + (p.saleProfit ?? 0), 0);

  const projectOptions: ProjectOption[] = purchase.project
    ? [{ id: purchase.project.id, name: purchase.project.name, type: purchase.project.type, status: purchase.project.status }]
    : [];

  const data: LandHubData = {
    purchase: {
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
      mode: purchase.mode,
      // Land type & lease
      landType: purchase.landType,
      leaseType: purchase.leaseType,
      leasePeriodYears: purchase.leasePeriodYears,
      leaseStartDate: purchase.leaseStartDate?.toISOString() ?? null,
      leaseEndDate: purchase.leaseEndDate?.toISOString() ?? null,
      // Cost breakup
      baseCost: toNum(purchase.baseCost),
      leaseRentPercent: purchase.leaseRentPercent ? toNum(purchase.leaseRentPercent) : null,
      leaseRentAmount: purchase.leaseRentAmount ? toNum(purchase.leaseRentAmount) : null,
      gstPercent: purchase.gstPercent ? toNum(purchase.gstPercent) : null,
      gstAmount: purchase.gstAmount ? toNum(purchase.gstAmount) : null,
      registrationPercent: purchase.registrationPercent ? toNum(purchase.registrationPercent) : null,
      registrationAmount: purchase.registrationAmount ? toNum(purchase.registrationAmount) : null,
      stampDutyPercent: purchase.stampDutyPercent ? toNum(purchase.stampDutyPercent) : null,
      stampDutyAmount: purchase.stampDutyAmount ? toNum(purchase.stampDutyAmount) : null,
      brokerageAmount: purchase.brokerageAmount ? toNum(purchase.brokerageAmount) : null,
      legalFees: purchase.legalFees ? toNum(purchase.legalFees) : null,
      otherCharges: purchase.otherCharges ? toNum(purchase.otherCharges) : null,
    },
    parcels: parcelRows,
    parcelSummaries,
    sales: landSales.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      salePrice: toNum(s.salePrice),
      profit: toNum(s.profit),
      saleDate: s.saleDate.toISOString(),
      paymentStatus: s.paymentStatus,
      parcelNumber: purchase.parcels.find((p) => p.id === s.landParcelId)?.number ?? "—",
      customerName: s.customer.name,
    })),
    stats: {
      parcelCount: sellable.length,
      availableCount: unsold.filter((p) => p.status === "AVAILABLE").length,
      holdCount: unsold.filter((p) => p.status === "HOLD").length,
      soldCount: sold.length,
      partitionedCount: parcelRows.filter((p) => p.status === "PARTITIONED").length,
      availableArea: unsold.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + p.area, 0),
      unsoldValue,
      costBasis,
      valuationGain: unsoldValue - costBasis,
      soldRevenue,
      soldProfit,
    },
    permissions: {
      canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
      canDelete: hasPermission(role, PERM.ASSETS_MANAGE),
      canPartition: hasPermission(role, PERM.LAND_PARTITION),
      canSell: hasPermission(role, PERM.SALE_CREATE),
      canManageLegal: hasPermission(role, PERM.LEGAL_MANAGE),
    },
    customers: customers.map((c) => ({ id: c.id, name: c.name })),
    projectOptions,
    legalDocs: legalDocs.map((d) => ({
      id: d.id,
      landPurchaseId: d.landPurchaseId,
      projectId: d.projectId,
      type: d.type,
      title: d.title,
      authority: d.authority,
      status: d.status,
      appliesTo: d.appliesTo,
      docNumber: d.docNumber,
      sortOrder: d.sortOrder,
      prerequisiteType: d.prerequisiteType,
      obtained: d.obtained,
      applicationDate: d.applicationDate?.toISOString() ?? null,
      issueDate: d.issueDate?.toISOString() ?? null,
      validFrom: d.validFrom?.toISOString() ?? null,
      validTill: d.validTill?.toISOString() ?? null,
      amount: d.amount ? toNum(d.amount) : null,
      expectedRegistryDate: d.expectedRegistryDate?.toISOString() ?? null,
      documentUrl: d.documentUrl,
      documentName: d.documentName,
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    })),
    parcelBuiltUnits: parcelBuiltUnits.map((u) => ({
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
      projectId: u.projectId,
      projectName: u.project.name,
    })),
  };

  return <LandHub data={data} />;
}

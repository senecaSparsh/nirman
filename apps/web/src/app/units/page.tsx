import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { UnitsHub } from "@/components/built-units/units-hub";
import { PageLoading } from "@/components/page-loading";
import { formatCurrency } from "@/lib/utils";
import type { BuiltUnitRow, ProjectOption, PhaseOption } from "@/lib/types";
import type { RenovationRow } from "@/components/renovations/renovations-view";

import { NoAccess } from "@/components/no-access";
export default function BuiltUnitsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading built units…" variant="cards" />}>
      <BuiltUnitsContent />
    </Suspense>
  );
}

async function BuiltUnitsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <NoAccess what="built units" />
    );
  }

  const canViewPortals = hasPermission(role, PERM.SALES_VIEW);

  const perms = {
    canCreate: hasPermission(role, PERM.ASSETS_MANAGE),
    canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
    canSell: hasPermission(role, PERM.SALE_CREATE),
  };

  const [builtUnits, projects, phases, customers, portalListings, portalBuiltUnits, portalProj] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { deletedAt: null, project: { companyId: company.id } },
      orderBy: [{ projectId: "asc" }, { unitNumber: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        assetSales: {
          where: { status: "ACTIVE" },
          select: {
            id: true, saleNumber: true, salePrice: true, profit: true,
            saleDate: true, paymentStatus: true,
            customer: { select: { name: true } },
          },
          take: 1,
        },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.projectPhase.findMany({
      where: { project: { companyId: company.id, deletedAt: null } },
      orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, status: true, projectId: true },
    }),
    // Customer has no companyId — scope to customers with sales in this company.
    prisma.customer.findMany({
      where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    canViewPortals
      ? prisma.portalListing.findMany({
          where: { companyId: company.id },
          include: {
            builtUnit: {
              select: {
                id: true,
                unitNumber: true,
                unitType: true,
                status: true,
                area: true,
                areaUnit: true,
                floor: true,
                askingPrice: true,
                // RERA fields
                carpetArea: true,
                superBuiltUpArea: true,
                balconyArea: true,
                clearHeight: true,
                hasLoadingDock: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
    canViewPortals
      ? prisma.builtUnit.findMany({
          where: {
            deletedAt: null,
            status: { in: ["AVAILABLE", "UNDER_CONSTRUCTION"] },
            project: { companyId: company.id, deletedAt: null },
          },
          select: {
            id: true,
            unitNumber: true,
            unitType: true,
            status: true,
            area: true,
            areaUnit: true,
            floor: true,
            askingPrice: true,
            // RERA fields
            carpetArea: true,
            superBuiltUpArea: true,
            balconyArea: true,
            clearHeight: true,
            hasLoadingDock: true,
            project: { select: { id: true, name: true } },
          },
          orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
          take: 500,
        })
      : Promise.resolve([]),
    canViewPortals
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const unitRows: BuiltUnitRow[] = builtUnits.map((u) => {
    const sale = u.assetSales[0];
    return {
      id: u.id,
      projectId: u.projectId,
      projectName: u.project.name,
      phaseId: u.phaseId,
      phaseName: u.phase?.name ?? null,
      unitType: u.unitType,
      unitNumber: u.unitNumber,
      floor: u.floor,
      wing: u.wing,
      area: toNum(u.area),
      areaUnit: u.areaUnit,
      // RERA fields
      carpetArea: u.carpetArea ? toNum(u.carpetArea) : null,
      superBuiltUpArea: u.superBuiltUpArea ? toNum(u.superBuiltUpArea) : null,
      balconyArea: u.balconyArea ? toNum(u.balconyArea) : null,
      clearHeight: u.clearHeight ? toNum(u.clearHeight) : null,
      hasLoadingDock: u.hasLoadingDock,
      status: u.status,
      originType: u.originType,
      acquisitionCost: toNum(u.acquisitionCost),
      purchaseDate: u.purchaseDate ? u.purchaseDate.toISOString() : null,
      landParcelId: u.landParcelId,
      productionCost: toNum(u.productionCost),
      askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
      currentValuation: toNum(u.currentValuation),
      nrvWriteDown: toNum(u.nrvWriteDown),
      saleId: u.saleId,
      salePrice: sale ? toNum(sale.salePrice) : null,
      saleProfit: sale ? toNum(sale.profit) : null,
      saleNumber: sale?.saleNumber ?? null,
      saleDate: sale ? sale.saleDate.toISOString() : null,
      customerName: sale?.customer.name ?? null,
    };
  });

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const phaseRows: PhaseOption[] = phases.map((p) => ({
    id: p.id, projectId: p.projectId, name: p.name, status: p.status,
  }));

  const customerRows = customers.map((c) => ({ id: c.id, name: c.name }));

  const canManagePortals = canViewPortals && hasPermission(role, PERM.SALES_MANAGE);

  const portalListingRows = portalListings.map((l) => ({
    id: l.id,
    builtUnitId: l.builtUnitId,
    unitNumber: l.builtUnit.unitNumber,
    unitType: l.builtUnit.unitType,
    unitStatus: l.builtUnit.status,
    projectName: l.builtUnit.project.name,
    portalName: l.portalName,
    listingId: l.listingId,
    listingUrl: l.listingUrl,
    status: l.status as "DRAFT" | "LISTED" | "DELISTED" | "SYNC_FAILED",
    title: l.title,
    description: l.description,
    askingPrice: toNum(l.askingPrice),
    area: toNum(l.builtUnit.area),
    areaUnit: l.builtUnit.areaUnit,
    // RERA fields
    carpetArea: l.builtUnit.carpetArea ? toNum(l.builtUnit.carpetArea) : null,
    superBuiltUpArea: l.builtUnit.superBuiltUpArea ? toNum(l.builtUnit.superBuiltUpArea) : null,
    balconyArea: l.builtUnit.balconyArea ? toNum(l.builtUnit.balconyArea) : null,
    clearHeight: l.builtUnit.clearHeight ? toNum(l.builtUnit.clearHeight) : null,
    hasLoadingDock: l.builtUnit.hasLoadingDock,
    floor: l.builtUnit.floor,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    furnishing: l.furnishing,
    photos: l.photos,
    listedAt: l.listedAt?.toISOString() ?? null,
    lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    syncError: l.syncError,
  }));

  const portalUnitOptions = portalBuiltUnits.map((u) => ({
    id: u.id,
    label: `${u.project.name} — ${u.unitNumber} (${u.unitType.replace("_", " ")})`,
    unitNumber: u.unitNumber,
    unitType: u.unitType,
    askingPrice: toNum(u.askingPrice),
    area: toNum(u.area),
    areaUnit: u.areaUnit,
    // RERA fields
    carpetArea: u.carpetArea ? toNum(u.carpetArea) : null,
    superBuiltUpArea: u.superBuiltUpArea ? toNum(u.superBuiltUpArea) : null,
    balconyArea: u.balconyArea ? toNum(u.balconyArea) : null,
    clearHeight: u.clearHeight ? toNum(u.clearHeight) : null,
    hasLoadingDock: u.hasLoadingDock,
    floor: u.floor,
  }));

  const portalProjects = portalProj.map((p) => ({ id: p.id, name: p.name }));

  // ── Renovation data (renovations improve existing built units / land parcels) ──
  const canManageRenovations = hasPermission(role, PERM.ASSETS_MANAGE);
  const [renovations, renProjects, renBuiltUnits, renLandParcels] = await Promise.all([
    prisma.renovationProject.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        builtUnit: { select: { id: true, unitNumber: true, unitType: true } },
        landParcel: { select: { id: true, number: true } },
        project: { select: { id: true, name: true } },
        costs: { orderBy: { createdAt: "desc" }, take: 50 },
        _count: { select: { costs: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.builtUnit.findMany({
      where: { project: { companyId: company.id }, deletedAt: null, status: { in: ["AVAILABLE", "HOLD", "UNDER_CONSTRUCTION", "RENTED"] } },
      select: { id: true, unitNumber: true, unitType: true, projectId: true, currentValuation: true },
      orderBy: { unitNumber: "asc" },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, status: { in: ["AVAILABLE", "HOLD", "RENTED"] } },
      select: { id: true, number: true, currentValuation: true },
      orderBy: { number: "asc" },
    }),
  ]);
  const renovationRows: RenovationRow[] = renovations.map((r) => ({
    id: r.id,
    renovationNumber: r.renovationNumber,
    type: r.type,
    status: r.status,
    title: r.title,
    description: r.description,
    builtUnitId: r.builtUnitId,
    builtUnitNumber: r.builtUnit?.unitNumber ?? null,
    builtUnitType: r.builtUnit?.unitType ?? null,
    landParcelId: r.landParcelId,
    landParcelNumber: r.landParcel?.number ?? null,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    budget: toNum(r.budget),
    actualCost: toNum(r.actualCost),
    originalValuation: toNum(r.originalValuation),
    newValuation: r.newValuation ? toNum(r.newValuation) : null,
    startDate: r.startDate?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    costCount: r._count.costs,
    costs: r.costs.map((c) => ({
      id: c.id,
      costType: c.costType,
      amount: toNum(c.amount),
      vendor: c.vendor,
      notes: c.notes,
      date: c.date.toISOString(),
    })),
  }));
  const renovationProjects = renProjects.map((p) => ({ id: p.id, name: p.name }));
  const renovationBuiltUnits = renBuiltUnits.map((u) => ({ id: u.id, unitNumber: u.unitNumber, unitType: u.unitType, projectId: u.projectId }));
  const renovationLandParcels = renLandParcels.map((p) => ({ id: p.id, number: p.number }));

  // "Sold" = has an active sale (unit may be RESERVED during staged sale flow).
  const soldCount = unitRows.filter((u) => u.saleId != null).length;
  const availableCount = unitRows.filter((u) => u.status === "AVAILABLE").length;
  const totalValuation = unitRows.reduce((s, u) => s + u.currentValuation, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Built Units"
        description="Flats, shops, and offices built on projects — track status, valuation, and portal listings."
        stats={[
          { label: "Total", value: unitRows.length, hint: "All built units (flats, shops, offices) across every project, excluding soft-deleted." },
          { label: "Available", value: availableCount, tone: availableCount > 0 ? "success" : "muted", hint: "Units with AVAILABLE status — ready to be sold or listed on portals." },
          { label: "Sold", value: soldCount, tone: soldCount > 0 ? "success" : "muted", hint: "Units that have been sold and linked to an active sale." },
          { label: "Valuation", value: formatCurrency(totalValuation), hint: "Sum of current valuations across all built units, after any NRV write-downs." },
        ]}
      />
      <UnitsHub
        units={unitRows}
        projects={projectRows}
        phases={phaseRows}
        customers={customerRows}
        unitPermissions={perms}
        portalListings={portalListingRows}
        portalUnitOptions={portalUnitOptions}
        portalProjects={portalProjects}
        portalPermissions={{ canManage: canManagePortals }}
        canViewPortals={canViewPortals}
        renovationRows={renovationRows}
        renovationProjects={renovationProjects}
        renovationBuiltUnits={renovationBuiltUnits}
        renovationLandParcels={renovationLandParcels}
        renovationPermissions={{ canManage: canManageRenovations }}
      />
    </div>
  );
}

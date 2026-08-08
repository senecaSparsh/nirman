import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { UnitsHub } from "@/components/built-units/units-hub";
import { PageLoading } from "@/components/page-loading";
import type { BuiltUnitRow, ProjectOption, PhaseOption } from "@/lib/types";

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

  const unitRows: BuiltUnitRow[] = builtUnits.map((u) => ({
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
    status: u.status,
    productionCost: toNum(u.productionCost),
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    currentValuation: toNum(u.currentValuation),
    nrvWriteDown: toNum(u.nrvWriteDown),
    saleId: u.saleId,
  }));

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
    floor: u.floor,
  }));

  const portalProjects = portalProj.map((p) => ({ id: p.id, name: p.name }));

  return (
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
    />
  );
}

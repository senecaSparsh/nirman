import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole, scopeWhere, projectScopeFilter } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { NoAccess } from "@/components/no-access";
import { GatePassesView } from "@/components/gate-pass/gate-passes-view";
import type { StockLocationRow, MaterialRow, ProjectOption } from "@/lib/types";

export async function GatePassesContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.GATE_PASS_VIEW)) {
    return <NoAccess what="gate passes" />;
  }

  const perms = {
    canCreate: hasPermission(role, PERM.GATE_PASS_CREATE),
    canApprove: hasPermission(role, PERM.GATE_PASS_APPROVE),
    canExit: hasPermission(role, PERM.GATE_PASS_EXIT),
    canManage: hasPermission(role, PERM.GATE_PASS_MANAGE),
  };

  const projectScope = await projectScopeFilter();

  const [gatePasses, locations, materials, projects] = await Promise.all([
    prisma.gatePass.findMany({
      take: 500,
      where: { companyId: company.id, ...await scopeWhere("GatePass") },
      orderBy: { createdAt: "desc" },
      include: {
        lines: true,
        location: { select: { id: true, name: true, type: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
        exitedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.stockLocation.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, type: true, name: true, projectId: true, lat: true, lng: true, geoRadius: true },
    }),
    prisma.material.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, grade: true, specification: true, unit: true, isLotTracked: true, isScrap: true, baseUnit: true, secondaryUnit: true, uomConversionFactor: true },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null, ...(projectScope ?? {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  const gpRows = gatePasses.map((gp) => ({
    id: gp.id,
    gatePassNumber: gp.gatePassNumber,
    status: gp.status,
    category: gp.category,
    refType: gp.refType,
    refId: gp.refId,
    locationId: gp.locationId,
    locationName: gp.location.name,
    locationType: gp.location.type,
    projectId: gp.projectId,
    projectName: gp.project?.name ?? null,
    vehicleNumber: gp.vehicleNumber,
    vehicleType: gp.vehicleType,
    driverName: gp.driverName,
    driverPhone: gp.driverPhone,
    transporterName: gp.transporterName,
    destination: gp.destination,
    purpose: gp.purpose,
    notes: gp.notes,
    createdAt: gp.createdAt.toISOString(),
    submittedAt: gp.submittedAt?.toISOString() ?? null,
    approvedAt: gp.approvedAt?.toISOString() ?? null,
    exitedAt: gp.exitedAt?.toISOString() ?? null,
    rejectionReason: gp.rejectionReason,
    approvalNotes: gp.approvalNotes,
    createdByName: gp.createdBy?.name ?? null,
    submittedByName: gp.submittedBy?.name ?? null,
    approvedByName: gp.approvedBy?.name ?? null,
    rejectedByName: gp.rejectedBy?.name ?? null,
    exitedByName: gp.exitedBy?.name ?? null,
    exitNotes: gp.exitNotes,
    exitPhotos: gp.exitPhotos as { url: string; fileName?: string }[] | null,
    lineCount: gp.lines.length,
    lines: gp.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.materialCode,
      materialName: l.materialName,
      unit: l.unit,
      qty: toNum(l.qty),
      description: l.description,
    })),
  }));

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: null,
    projectId: l.projectId,
    projectName: null,
    stockValue: 0,
    itemCount: 0,
    companyId: company.id,
    companyName: company.name,
    lat: l.lat,
    lng: l.lng,
    geoRadius: l.geoRadius,
  }));

  const materialRows: MaterialRow[] = materials.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    grade: m.grade,
    specification: m.specification,
    categoryId: null,
    categoryName: null,
    unit: m.unit,
    hsnCode: null,
    gstRate: 0,
    standardCost: 0,
    minStock: null,
    reorderPoint: null,
    economicOrderQty: null,
    volumetricDensity: null,
    bulkDiscountPct: null,
    isCorporateCommodity: false,
    isLotTracked: m.isLotTracked ?? false,
    isScrap: m.isScrap ?? false,
    baseUnit: m.baseUnit,
    secondaryUnit: m.secondaryUnit,
    uomConversionFactor: m.uomConversionFactor == null ? null : toNum(m.uomConversionFactor),
    description: null,
    totalQty: 0,
    totalValue: 0,
    lowStock: false,
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
  }));

  const pending = gpRows.filter((g) => g.status === "PENDING").length;
  const approved = gpRows.filter((g) => g.status === "APPROVED").length;
  const _exited = gpRows.filter((g) => g.status === "EXITED").length;
  const rejected = gpRows.filter((g) => g.status === "REJECTED").length;

  return (
    <>
      <PageHeader
        title="Gate Passes"
        description="Outbound gate passes — items cannot leave the gate until an authorized person approves."
        stats={[
          { label: "Total", value: gpRows.length, hint: "All outbound gate passes created, regardless of status." },
          { label: "Pending approval", value: pending, hint: "Gate passes submitted and waiting for an authorized approver." },
          { label: "Approved (awaiting exit)", value: approved, hint: "Gate passes approved but the vehicle has not yet exited the gate." },
          { label: "Rejected", value: rejected, hint: "Gate passes denied by the approver — material cannot leave site." },
        ]}
      />
      <GatePassesView
        gatePasses={gpRows}
        locations={locationRows}
        materials={materialRows}
        projects={projectRows}
        permissions={perms}
      />
    </>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { GatePassesView } from "@/components/gate-pass/gate-passes-view";
import type { StockLocationRow, MaterialRow, ProjectOption } from "@/lib/types";

export const metadata = { title: "Gate Passes · Nirman" };

export default function GatePassesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading gate passes…" variant="list" />}>
        <GatePassesContent />
      </Suspense>
    </div>
  );
}

async function GatePassesContent() {
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

  const [gatePasses, locations, materials, projects] = await Promise.all([
    prisma.gatePass.findMany({
      where: { companyId: company.id },
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
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, type: true, name: true, projectId: true },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
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
  }));

  const materialRows: MaterialRow[] = materials.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
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
  const exited = gpRows.filter((g) => g.status === "EXITED").length;
  const rejected = gpRows.filter((g) => g.status === "REJECTED").length;

  return (
    <>
      <PageHeader
        title="Gate Passes"
        description="Outbound gate passes — items cannot leave the gate until an authorized person approves."
        stats={[
          { label: "Total", value: gpRows.length },
          { label: "Pending approval", value: pending },
          { label: "Approved (awaiting exit)", value: approved },
          { label: "Rejected", value: rejected },
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

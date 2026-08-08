import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { RequisitionsView } from "@/components/requisitions/requisitions-view";
import { PageLoading } from "@/components/page-loading";
import type { RequisitionRow } from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function RequisitionsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Material Indents"
        description="Site raises an indent for material — approve it, then convert it to a purchase order."
      />
      <Suspense fallback={<PageLoading label="Loading requisitions…" />}>
        <RequisitionsContent />
      </Suspense>
    </div>
  );
}

async function RequisitionsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return (
      <NoAccess what="requisitions" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.PROCUREMENT_MANAGE),
    canApprove: hasPermission(role, PERM.REQUISITION_APPROVE),
  };

  const [reqs, projects, phases, materials, suppliers, locations] = await Promise.all([
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id } },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        phase: { select: { name: true } },
        lines: {
          include: { material: { select: { code: true, name: true, unit: true } } },
        },
        vendorQuotes: {
          where: { status: { not: "REJECTED" } },
          select: { id: true, landedTotal: true, isCheapest: true, status: true },
        },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.projectPhase.findMany({
      where: { project: { companyId: company.id, deletedAt: null } },
      select: { id: true, name: true, projectId: true },
    }),
    // Global catalog entity — material definitions shared across companies.
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true },
    }),
    // Supplier has no companyId — scope to suppliers with POs in this company.
    prisma.supplier.findMany({
      where: { deletedAt: null, purchaseOrders: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
  ]);

  const rows: RequisitionRow[] = reqs.map((r) => ({
    id: r.id,
    reqNumber: r.reqNumber,
    projectId: r.projectId,
    projectName: r.project.name,
    phaseId: r.phaseId,
    phaseName: r.phase?.name ?? null,
    status: r.status,
    requestDate: r.requestDate.toISOString(),
    neededByDate: r.neededByDate?.toISOString() ?? null,
    notes: r.notes,
    convertedPoId: r.convertedPoId,
    lineCount: r.lines.length,
    totalQty: r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0),
    quoteCount: r.vendorQuotes.length,
    minQuotesRequired: r.minQuotesRequired,
    quotesWaived: r.quotesWaived,
  }));

  return (
    <RequisitionsView
      requisitions={rows}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      phases={phases.map((p) => ({ id: p.id, name: p.name, projectId: p.projectId }))}
      materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type }))}
      permissions={perms}
    />
  );
}

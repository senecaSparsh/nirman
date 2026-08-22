import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { QualityControlView } from "@/components/quality-control/quality-control-view";

export default function QualityControlPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading NCRs…" variant="default" />}>
        <QcContent />
      </Suspense>
    </div>
  );
}

async function QcContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="quality control" />;
  }

  const [projects, ncrs, subcontractors] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.nonConformanceReport.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, name: true, trade: true } },
        capa: { select: { id: true, status: true, capaNumber: true } },
      },
    }),
    prisma.subcontractor.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true },
    }),
  ]);

  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const serialized = ncrs.map((n) => ({
    id: n.id,
    ncrNumber: n.ncrNumber,
    title: n.title,
    severity: n.severity,
    status: n.status,
    category: n.category,
    projectName: n.project.name,
    subcontractorName: n.subcontractor?.name ?? null,
    location: n.location,
    hasCapa: !!n.capa,
    capaStatus: n.capa?.status ?? null,
    raisedAt: n.raisedAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Quality Control"
        description="Non-Conformance Reports (NCR) and Corrective And Preventive Actions (CAPA) — track quality issues, root causes, and resolutions."
        stats={[
          { label: "Total", value: serialized.length },
          { label: "Open", value: serialized.filter((n) => n.status === "OPEN" || n.status === "UNDER_REVIEW").length },
          { label: "CAPA Req", value: serialized.filter((n) => n.status === "CAPA_REQUIRED").length },
          { label: "Closed", value: serialized.filter((n) => n.status === "CLOSED").length },
        ]}
      />
      <QualityControlView
        ncrs={serialized}
        projects={projects}
        subcontractors={subcontractors}
        canManage={canManage}
      />
    </>
  );
}

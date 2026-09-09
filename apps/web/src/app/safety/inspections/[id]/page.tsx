import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { notFound } from "next/navigation";
import { getCompany, getUserRole, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { InspectionDetailClient } from "@/components/safety/inspection-detail-client";

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageLoading label="Loading inspection…" variant="default" />}>
      <InspectionDetailContent id={id} />
    </Suspense>
  );
}

async function InspectionDetailContent({ id }: { id: string }) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.SAFETY_VIEW)) return <NoAccess what="inspection" />;
  const canManage = hasPermission(role, PERM.SAFETY_MANAGE);

  const insp = await prisma.safetyInspection.findFirst({
    where: {...await scopeWhere("SafetyInspection"),  id, companyId: company.id },
    include: {
      project: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true } },
    },
  });

  if (!insp || insp.companyId !== company.id) notFound();

  const serialized = {
    id: insp.id, inspectionNumber: insp.inspectionNumber, title: insp.title,
    status: insp.status, result: insp.result,
    projectName: insp.project.name,
    inspectorName: insp.inspectorName,
    findings: insp.findings, complianceNotes: insp.complianceNotes, followUpActions: insp.followUpActions,
    attachments: insp.attachments,
    scheduledDate: insp.scheduledDate.toISOString(),
    conductedDate: insp.conductedDate?.toISOString() ?? null,
    conductedByName: insp.inspector?.name ?? null,
  };

  return (
    <>
      <PageHeader title={insp.title} description={`${insp.inspectionNumber} · ${insp.project.name}`} />
      <InspectionDetailClient inspection={serialized} canManage={canManage} />
    </>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { notFound } from "next/navigation";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { HazardDetailClient } from "@/components/safety/hazard-detail-client";

export default async function HazardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageLoading label="Loading hazard…" variant="default" />}>
      <HazardDetailContent id={id} />
    </Suspense>
  );
}

async function HazardDetailContent({ id }: { id: string }) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) return <NoAccess what="hazard" />;
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const hazard = await prisma.safetyHazard.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      identifiedBy: { select: { id: true, name: true } },
      mitigatedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  if (!hazard || hazard.companyId !== company.id) notFound();

  const serialized = {
    id: hazard.id, hazardNumber: hazard.hazardNumber, title: hazard.title, description: hazard.description,
    status: hazard.status, riskLevel: hazard.riskLevel, likelihood: hazard.likelihood, severity: hazard.severity,
    projectName: hazard.project.name, location: hazard.location,
    wbsNodeName: hazard.wbsNode ? `${hazard.wbsNode.code} — ${hazard.wbsNode.name}` : null,
    mitigationPlan: hazard.mitigationPlan, resolutionNotes: hazard.resolutionNotes,
    targetResolutionDate: hazard.targetResolutionDate?.toISOString() ?? null,
    attachments: hazard.attachments,
    identifiedAt: hazard.identifiedAt.toISOString(), identifiedByName: hazard.identifiedBy?.name ?? null,
    mitigatedAt: hazard.mitigatedAt?.toISOString() ?? null, mitigatedByName: hazard.mitigatedBy?.name ?? null,
    resolvedAt: hazard.resolvedAt?.toISOString() ?? null, resolvedByName: hazard.resolvedBy?.name ?? null,
  };

  return (
    <>
      <PageHeader title={hazard.title} description={`${hazard.hazardNumber} · ${hazard.project.name}`} />
      <HazardDetailClient hazard={serialized} canManage={canManage} />
    </>
  );
}

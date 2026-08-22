import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { notFound } from "next/navigation";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { IncidentDetailClient } from "@/components/safety/incident-detail-client";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageLoading label="Loading incident…" variant="default" />}>
      <IncidentDetailContent id={id} />
    </Suspense>
  );
}

async function IncidentDetailContent({ id }: { id: string }) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) return <NoAccess what="incident" />;
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const incident = await prisma.safetyIncident.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      reportedBy: { select: { id: true, name: true } },
      investigatedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });

  if (!incident || incident.companyId !== company.id) notFound();

  const serialized = {
    id: incident.id, incidentNumber: incident.incidentNumber, title: incident.title, description: incident.description,
    type: incident.type, severity: incident.severity, status: incident.status,
    projectName: incident.project.name, location: incident.location,
    wbsNodeName: incident.wbsNode ? `${incident.wbsNode.code} — ${incident.wbsNode.name}` : null,
    peopleInvolved: incident.peopleInvolved, injuredCount: incident.injuredCount, fatalities: incident.fatalities,
    propertyDamageEstimate: toNum(incident.propertyDamageEstimate),
    incidentDate: incident.incidentDate.toISOString(), incidentTime: incident.incidentTime,
    rootCause: incident.rootCause, correctiveActions: incident.correctiveActions, closureNotes: incident.closureNotes,
    attachments: incident.attachments,
    reportedAt: incident.reportedAt.toISOString(), reportedByName: incident.reportedBy?.name ?? null,
    investigatedAt: incident.investigatedAt?.toISOString() ?? null, investigatedByName: incident.investigatedBy?.name ?? null,
    closedAt: incident.closedAt?.toISOString() ?? null, closedByName: incident.closedBy?.name ?? null,
  };

  return (
    <>
      <PageHeader title={incident.title} description={`${incident.incidentNumber} · ${incident.project.name}`} />
      <IncidentDetailClient incident={serialized} canManage={canManage} />
    </>
  );
}

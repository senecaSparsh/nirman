import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { notFound } from "next/navigation";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileInspectionDetailClient } from "./MobileInspectionDetailClient";

export default async function MobileInspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileInspectionDetailContent id={id} />
    </Suspense>
  );
}

async function MobileInspectionDetailContent({ id }: { id: string }) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const insp = await prisma.safetyInspection.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      scheduledBy: { select: { id: true, name: true } },
      conductedBy: { select: { id: true, name: true } },
    },
  });

  if (!insp || insp.companyId !== company.id) notFound();

  const serialized = {
    id: insp.id, inspectionNumber: insp.inspectionNumber, title: insp.title, status: insp.status, result: insp.result,
    projectName: insp.project.name, wbsNodeName: insp.wbsNode ? `${insp.wbsNode.code} — ${insp.wbsNode.name}` : null,
    inspectorName: insp.inspectorName, findings: insp.findings, complianceNotes: insp.complianceNotes, followUpActions: insp.followUpActions,
    attachments: insp.attachments,
    scheduledDate: insp.scheduledDate.toISOString(),
    scheduledAt: insp.scheduledAt.toISOString(), scheduledByName: insp.scheduledBy?.name ?? null,
    conductedDate: insp.conductedDate?.toISOString() ?? null, conductedByName: insp.conductedBy?.name ?? null,
  };

  return <MobileInspectionDetailClient inspection={serialized} canManage={canManage} />;
}

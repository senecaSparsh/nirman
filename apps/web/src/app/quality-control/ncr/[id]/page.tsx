import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { notFound } from "next/navigation";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { NcrDetailClient } from "@/components/quality-control/ncr-detail-client";

export default async function NcrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageLoading label="Loading NCR…" variant="default" />}>
      <NcrDetailContent id={id} />
    </Suspense>
  );
}

async function NcrDetailContent({ id }: { id: string }) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="NCR" />;
  }

  const ncr = await prisma.nonConformanceReport.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      boqItem: { select: { id: true, serialNo: true, description: true } },
      subcontractor: { select: { id: true, name: true, trade: true } },
      raisedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      capa: {
        include: {
          correctiveDoneBy: { select: { id: true, name: true } },
          preventiveDoneBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
          closedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!ncr || ncr.companyId !== company.id) notFound();

  const serialized = {
    id: ncr.id,
    ncrNumber: ncr.ncrNumber,
    title: ncr.title,
    description: ncr.description,
    category: ncr.category,
    severity: ncr.severity,
    status: ncr.status,
    projectName: ncr.project.name,
    location: ncr.location,
    wbsNodeName: ncr.wbsNode ? `${ncr.wbsNode.code} — ${ncr.wbsNode.name}` : null,
    boqItemSerial: ncr.boqItem?.serialNo ?? null,
    boqItemDescription: ncr.boqItem?.description ?? null,
    responsibleParty: ncr.responsibleParty,
    subcontractorName: ncr.subcontractor ? `${ncr.subcontractor.name}${ncr.subcontractor.trade ? ` (${ncr.subcontractor.trade})` : ""}` : null,
    attachments: ncr.attachments,
    reviewNotes: ncr.reviewNotes,
    closureNotes: ncr.closureNotes,
    raisedAt: ncr.raisedAt.toISOString(),
    raisedByName: ncr.raisedBy?.name ?? null,
    reviewedAt: ncr.reviewedAt?.toISOString() ?? null,
    reviewedByName: ncr.reviewedBy?.name ?? null,
    closedAt: ncr.closedAt?.toISOString() ?? null,
    closedByName: ncr.closedBy?.name ?? null,
    capa: ncr.capa ? {
      id: ncr.capa.id,
      capaNumber: ncr.capa.capaNumber,
      status: ncr.capa.status,
      rootCause: ncr.capa.rootCause,
      correctiveAction: ncr.capa.correctiveAction,
      correctiveDueDate: ncr.capa.correctiveDueDate?.toISOString() ?? null,
      correctiveDoneAt: ncr.capa.correctiveDoneAt?.toISOString() ?? null,
      correctiveDoneByName: ncr.capa.correctiveDoneBy?.name ?? null,
      preventiveAction: ncr.capa.preventiveAction,
      preventiveDueDate: ncr.capa.preventiveDueDate?.toISOString() ?? null,
      preventiveDoneAt: ncr.capa.preventiveDoneAt?.toISOString() ?? null,
      preventiveDoneByName: ncr.capa.preventiveDoneBy?.name ?? null,
      verificationMethod: ncr.capa.verificationMethod,
      verificationNotes: ncr.capa.verificationNotes,
      verifiedAt: ncr.capa.verifiedAt?.toISOString() ?? null,
      verifiedByName: ncr.capa.verifiedBy?.name ?? null,
      closureNotes: ncr.capa.closureNotes,
      closedAt: ncr.capa.closedAt?.toISOString() ?? null,
      closedByName: ncr.capa.closedBy?.name ?? null,
    } : null,
  };

  return (
    <>
      <PageHeader title={ncr.title} description={`${ncr.ncrNumber} · ${ncr.project.name}`} />
      <NcrDetailClient ncr={serialized} canManage={canManage} />
    </>
  );
}

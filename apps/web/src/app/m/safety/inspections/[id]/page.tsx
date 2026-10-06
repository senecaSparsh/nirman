import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { notFound } from "next/navigation";
import { scopeWhere, getCompany, getEffectivePermissions, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileInspectionDetailClient } from "./MobileInspectionDetailClient";

export default async function MobileInspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileInspectionDetailContent id={id} />
    </Suspense>
  );
}

async function MobileInspectionDetailContent({ id }: { id: string }) {
  await connection();
  const company = await getCompany();
  // View = effective (matches list API); manage = global (matches the
  // detail PATCH which is org-level safety.manage).
  const __effPerms = await getEffectivePermissions();
  const __globalPerms = await getUserPermissions();
  if (!__effPerms.includes(PERM.SAFETY_VIEW)) notFound();
  const canManage = __globalPerms.includes(PERM.SAFETY_MANAGE);

  const insp = await prisma.safetyInspection.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("SafetyInspection") },
    include: {
      project: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true } },
    },
  });

  if (!insp) notFound();

  const serialized = {
    id: insp.id, inspectionNumber: insp.inspectionNumber, title: insp.title, status: insp.status, result: insp.result,
    projectName: insp.project.name,
    inspectorName: insp.inspectorName, findings: insp.findings, complianceNotes: insp.complianceNotes, followUpActions: insp.followUpActions,
    attachments: insp.attachments,
    scheduledDate: insp.scheduledDate.toISOString(),
    conductedDate: insp.conductedDate?.toISOString() ?? null, conductedByName: insp.inspector?.name ?? null,
  };

  return (
    <PageContextProvider value={{
      entityType: "inspection",
      status: insp.status,
      label: insp.inspectionNumber,
      subtitle: insp.project.name,
      recordId: insp.id,
    }}>
      <MobileInspectionDetailClient inspection={serialized} canManage={canManage} />
    </PageContextProvider>
  );
}

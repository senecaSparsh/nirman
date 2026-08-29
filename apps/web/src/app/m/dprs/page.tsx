import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileDprsList } from "./MobileDprsList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileFab } from "@/components/mobile/v2/scaffold";

export default function MobileDprsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileDprsContent />
    </Suspense>
  );
}

async function MobileDprsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canSubmit = hasPermission(role, PERM.DPR_SUBMIT);

  const BATCH_SIZE = 40;
  const dprs = await prisma.dailyProgressReport.findMany({
    where: { project: { companyId: company.id } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: BATCH_SIZE + 1,
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
    },
  });

  const hasMore = dprs.length > BATCH_SIZE;
  const batch = hasMore ? dprs.slice(0, BATCH_SIZE) : dprs;
  const lastItem = batch[batch.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.date.toISOString()}|${lastItem.id}`
    : null;

  const serialized = batch.map((d) => ({
    id: d.id,
    date: d.date.toISOString(),
    projectName: d.project.name,
    projectId: d.project.id,
    submittedByName: d.submittedBy?.name ?? null,
    approvalStatus: d.approvalStatus,
    progressPct: toNum(d.progressPct),
    workType: d.workType ?? null,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "date", label: "Date", format: "date" },
    { key: "projectName", label: "Project" },
    { key: "submittedByName", label: "Supervisor" },
    { key: "approvalStatus", label: "Status" },
    { key: "progressPct", label: "Progress %" },
    { key: "workType", label: "Work Type" },
  ];

  return (
    <div>
      <MobileDprsList
        items={serialized}
        canSubmit={canSubmit}
        loadMoreUrl="/api/mobile/list/dprs"
        nextCursor={nextCursor}
        exportTitle="Daily Progress Reports"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={csvColumns}
        exportSummary={`${serialized.length} DPRs`}
      />
      {canSubmit && <MobileFab href="/m/site/dpr" label="Add today's DPR" />}
    </div>
  );
}

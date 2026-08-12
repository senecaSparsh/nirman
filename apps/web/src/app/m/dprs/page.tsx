import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileDprsList } from "./MobileDprsList";

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

  const dprs = await prisma.dailyProgressReport.findMany({
    where: { project: { companyId: company.id } },
    orderBy: { date: "desc" },
    take: 40,
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
    },
  });

  const serialized = dprs.map((d) => ({
    id: d.id,
    date: d.date.toISOString(),
    projectName: d.project.name,
    projectId: d.project.id,
    submittedByName: d.submittedBy?.name ?? null,
    approvalStatus: d.approvalStatus,
    progressPct: toNum(d.progressPct),
    workType: d.workType ?? null,
  }));

  return (
    <div>
      <MobileDprsList items={serialized} canSubmit={canSubmit} />
    </div>
  );
}

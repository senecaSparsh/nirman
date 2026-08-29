import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileWorkflowsList, type WorkflowListItem } from "./MobileWorkflowsList";

/**
 * /m/workflows — mobile automation workflows list. Shows workflow
 * name, status, schedule, run count, and next run time.
 */
export default function MobileWorkflowsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileWorkflowsContent />
    </Suspense>
  );
}

async function MobileWorkflowsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <MobileNoAccess what="workflows" />;
  }

  const canManage = hasPermission(role, PERM.WORKFLOWS_MANAGE);

  const workflows = await prisma.workflow.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { runs: true } },
      schedules: {
        where: { enabled: true },
        select: { nextRunAt: true, intervalM: true, cron: true },
      },
    },
  });

  const rows: WorkflowListItem[] = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    icon: w.icon,
    status: w.status,
    runCount: w._count.runs,
    nextRun: w.schedules[0]?.nextRunAt?.toISOString() ?? null,
    schedule: w.schedules[0]
      ? { intervalM: w.schedules[0].intervalM, cron: w.schedules[0].cron }
      : null,
    createdAt: w.createdAt.toISOString(),
  }));

  return (
    <MobileWorkflowsList
      items={rows}
      canManage={canManage}
    />
  );
}

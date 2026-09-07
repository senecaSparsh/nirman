import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileWorkflowsList, type WorkflowListItem } from "./MobileWorkflowsList";

/**
 * /m/workflows — mobile automation workflows list. Shows workflow
 * name, status, schedule, run count, and next run time.
 */
export default function MobileWorkflowsPage() {
  return (
    <MobileListPage perm={PERM.CANVAS_VIEW} what="workflows" managePerm={PERM.WORKFLOWS_MANAGE}>
      {async ({ company, canManage }) => {
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
      }}
    </MobileListPage>
  );
}

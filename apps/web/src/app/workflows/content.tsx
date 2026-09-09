import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { WorkflowsList } from "@/components/workflows/workflows-list";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";

export async function WorkflowsContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <NoAccess />;
  }
  const company = await getCompany();
  const workflows = await prisma.workflow.findMany({
    take: 500,
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { runs: true } },
      schedules: { where: { enabled: true }, select: { nextRunAt: true, intervalM: true, cron: true } },
    },
  });

  return (
    <WorkflowsList
      workflows={workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        icon: w.icon,
        status: w.status,
        runCount: w._count.runs,
        nextRun: w.schedules[0]?.nextRunAt?.toISOString() ?? null,
        schedule: w.schedules[0] ?? null,
        createdAt: w.createdAt.toISOString(),
      }))}
    />
  );
}

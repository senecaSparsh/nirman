import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { PageHeader } from "@/components/page-header";
import { WorkflowsList } from "@/components/workflows/workflows-list";
import { PageLoading } from "@/components/page-loading";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";

export const metadata = { title: "Workflows · Nirman" };

export default function WorkflowsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows"
        description="Automate your work — build chains of events on the canvas, schedule them, and let the system handle the rest."
      />
      <Suspense fallback={<PageLoading label="Loading workflows…" />}>
        <WorkflowsContent />
      </Suspense>
    </div>
  );
}

async function WorkflowsContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <NoAccess />;
  }
  const company = await getCompany();
  const workflows = await prisma.workflow.findMany({
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

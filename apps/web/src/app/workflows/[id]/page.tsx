import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { PageHeader } from "@/components/page-header";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import type { WorkflowGraph } from "@/lib/workflow-engine";

export const metadata = { title: "Edit Workflow · Nirman" };

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="space-y-3">
      <PageHeader
        title="Edit Workflow"
        description="Modify the steps, connections, and schedule of this workflow."
      />
      <Suspense fallback={<PageLoading label="Loading workflow…" />}>
        <WorkflowLoader params={params} />
      </Suspense>
    </div>
  );
}

async function WorkflowLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <NoAccess />;
  }
  const company = await getCompany();
  const workflow = await prisma.workflow.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      schedules: { orderBy: { createdAt: "desc" }, take: 1 },
      runs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!workflow) {
    return <p className="text-body text-muted-foreground">Workflow not found.</p>;
  }

  const graph = workflow.graphJson as unknown as WorkflowGraph;
  const schedule = workflow.schedules[0] ?? null;

  return (
    <WorkflowBuilder
      workflowId={workflow.id}
      initialGraph={graph}
      initialName={workflow.name}
      initialDescription={workflow.description ?? ""}
      initialStatus={workflow.status}
      initialSchedule={schedule ? {
        cron: schedule.cron,
        intervalM: schedule.intervalM,
        enabled: schedule.enabled,
        nextRunAt: schedule.nextRunAt.toISOString(),
      } : null}
      runs={workflow.runs.map((r) => ({
        id: r.id,
        status: r.status,
        currentStep: r.currentStep as number | null,
        startedAt: r.startedAt ? formatDate(r.startedAt) : null,
        completedAt: r.completedAt ? formatDate(r.completedAt) : null,
        error: r.error,
        triggeredBy: r.triggeredBy,
        createdAt: formatDate(r.createdAt),
      }))}
    />
  );
}

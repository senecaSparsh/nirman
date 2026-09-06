import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { MobileNoAccess, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileWorkflowDetailClient, type WorkflowDetail, type WorkflowRunRow } from "./MobileWorkflowDetailClient";

export default function MobileWorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<MobileSkeletonDetail />}>
      <WorkflowDetailLoader params={params} />
    </Suspense>
  );
}

async function WorkflowDetailLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.CANVAS_VIEW)) {
    return <MobileNoAccess what="workflow" />;
  }

  const canManage = hasPermission(role, PERM.WORKFLOWS_MANAGE);

  const workflow = await prisma.workflow.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      schedules: { orderBy: { createdAt: "desc" }, take: 1 },
      runs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!workflow) {
    return (
      <MobileEmptyState title="Workflow not found" />
    );
  }

  const schedule = workflow.schedules[0] ?? null;

  const detail: WorkflowDetail = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    createdAt: workflow.createdAt.toISOString(),
    schedule: schedule
      ? {
          intervalM: schedule.intervalM,
          cron: schedule.cron,
          enabled: schedule.enabled,
          nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
        }
      : null,
  };

  const runs: WorkflowRunRow[] = workflow.runs.map((r) => ({
    id: r.id,
    status: r.status,
    currentStep: r.currentStep as number | null,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    error: r.error,
    triggeredBy: r.triggeredBy,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <PageContextProvider value={{
      entityType: "workflow",
      status: workflow.status,
      label: workflow.name,
      subtitle: workflow.description ?? undefined,
      recordId: workflow.id,
    }}>
      <MobileWorkflowDetailClient workflow={detail} runs={runs} canManage={canManage} />
    </PageContextProvider>
  );
}

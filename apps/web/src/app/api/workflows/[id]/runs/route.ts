import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { executeWorkflow } from "@/lib/workflow-engine";

/**
 * GET /api/workflows/[id]/runs — list recent runs
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_VIEW);
  const { id } = await params;
  const runs = await prisma.workflowRun.findMany({
    where: { workflowId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return json(runs);
});

/**
 * POST /api/workflows/[id]/runs — manually trigger a workflow run
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.WORKFLOWS_RUN);
  const company = await getCompany();

  const { id } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!workflow) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }

  const run = await executeWorkflow(workflow.id, "manual");

  return json({
    ok: true,
    runId: run.id,
    status: run.status,
    completedAt: run.completedAt?.toISOString() ?? null,
  });
});

import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, workflowSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";

/**
 * GET /api/workflows — list workflows scoped to the active company
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.CANVAS_VIEW);
  const company = await getCompany();
  const workflows = await prisma.workflow.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { runs: true, schedules: true } },
      schedules: { where: { enabled: true }, select: { id: true, nextRunAt: true, cron: true, intervalM: true } },
    },
  });
  return json(
    workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      icon: w.icon,
      status: w.status,
      runCount: w._count.runs,
      scheduleCount: w._count.schedules,
      nextRun: w.schedules[0]?.nextRunAt?.toISOString() ?? null,
      schedule: w.schedules[0] ?? null,
      createdAt: w.createdAt.toISOString(),
    })),
  );
});

/**
 * POST /api/workflows — create a new workflow (managers+ only)
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WORKFLOWS_MANAGE);
  const company = await getCompany();

  const body = await req.json();
  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Templates ship with blank runtime configs — inject the create-time
  // context so every generated workflow is executable: conditions need the
  // companyId for predicate evaluation, task/notification steps need an
  // assignee (default: the creator, who is the manager configuring it), and
  // auto_requisition needs a target project (default: first active project).
  const graph = parsed.data.graphJson as { steps?: Array<{ type?: string; config?: Record<string, unknown> }> };
  const needsDefaultProject = (graph?.steps ?? []).some(
    (s) => s.type === "auto_requisition" && !(s.config?.projectId),
  );
  const defaultProject = needsDefaultProject
    ? await prisma.project.findFirst({
        where: { companyId: company.id, deletedAt: null, status: { notIn: ["COMPLETED", "ON_HOLD"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    : null;
  for (const step of graph?.steps ?? []) {
    const cfg = (step.config ??= {});
    if ((step.type === "condition" || step.type === "auto_requisition") && !cfg.companyId) cfg.companyId = company.id;
    if ((step.type === "create_task" || step.type === "send_notification") && !cfg.assignedToId) cfg.assignedToId = user.id;
    if (step.type === "auto_requisition" && !cfg.projectId && defaultProject) cfg.projectId = defaultProject.id;
  }

  const created = await withSerializableTransaction(async (tx) => {
    const wf = await tx.workflow.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        icon: parsed.data.icon,
        graphJson: parsed.data.graphJson,
        status: "DRAFT",
        companyId: company.id,
        createdBy: user.id,
      },
    });
    await logAction(tx, {
      userId: user.id,
      companyId: company.id,
      action: "WORKFLOW_CREATE",
      entityType: "Workflow",
      entityId: wf.id,
      after: { name: wf.name, status: wf.status },
    });
    return wf;
  });

  revalidatePath("/workflows");
  revalidatePath("/m/workflows");
  return json({ ok: true, id: created.id }, { status: 201 });
});

import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, workflowScheduleSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/workflows/[id]/schedule — get the schedule for a workflow
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_VIEW);
  const company = await getCompany();
  const { id } = await params;
  // Verify the workflow belongs to the user's company
  const workflow = await prisma.workflow.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!workflow) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }
  const schedules = await prisma.scheduledWorkflow.findMany({
    where: { workflowId: id },
    orderBy: { createdAt: "desc" },
  });
  return json(schedules);
});

/**
 * POST /api/workflows/[id]/schedule — create or update a schedule
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.WORKFLOWS_MANAGE);
  const company = await getCompany();

  const { id: workflowId } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, companyId: company.id, deletedAt: null },
  });
  if (!workflow) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = workflowScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (!parsed.data.cron && !parsed.data.intervalM) {
    return json({ error: "Either cron or intervalM is required" }, { status: 400 });
  }

  // Compute next run time — default to 1 hour from now
  const nextRunAt = new Date(Date.now() + 60 * 60 * 1000);

  // Replace existing schedule (one schedule per workflow for simplicity)
  await prisma.scheduledWorkflow.deleteMany({ where: { workflowId } });

  const created = await prisma.scheduledWorkflow.create({
    data: {
      workflowId,
      cron: parsed.data.cron ?? null,
      intervalM: parsed.data.intervalM ?? null,
      enabled: parsed.data.enabled,
      nextRunAt,
    },
  });

  // Activate the workflow if it was in DRAFT
  if (workflow.status === "DRAFT") {
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: "ACTIVE" },
    });
  }

  return json({ ok: true, id: created.id, nextRunAt: created.nextRunAt.toISOString() }, { status: 201 });
});

/**
 * DELETE /api/workflows/[id]/schedule — remove the schedule
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.WORKFLOWS_MANAGE);
  const company = await getCompany();

  const { id } = await params;
  // Verify the workflow belongs to the user's company before deleting schedule
  const workflow = await prisma.workflow.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!workflow) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }
  await prisma.scheduledWorkflow.deleteMany({ where: { workflowId: id } });
  return json({ ok: true });
});

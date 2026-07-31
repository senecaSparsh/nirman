import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, workflowSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/workflows/[id] — get a single workflow with its graph
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_VIEW);
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      schedules: true,
      runs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!workflow || workflow.deletedAt) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }
  return json({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    icon: workflow.icon,
    status: workflow.status,
    graphJson: workflow.graphJson,
    schedules: workflow.schedules,
    recentRuns: workflow.runs,
    createdAt: workflow.createdAt.toISOString(),
  });
});

/**
 * PATCH /api/workflows/[id] — update workflow name/description/graph/status
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.WORKFLOWS_MANAGE);

  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.icon !== undefined) update.icon = body.icon;
  if (body.graphJson !== undefined) update.graphJson = body.graphJson;
  if (body.status !== undefined) update.status = body.status;

  const updated = await prisma.workflow.update({
    where: { id },
    data: update,
  });

  return json({ ok: true, id: updated.id });
});

/**
 * DELETE /api/workflows/[id] — soft delete a workflow
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.WORKFLOWS_MANAGE);

  const { id } = await params;
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }

  await prisma.workflow.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });

  return json({ ok: true });
});

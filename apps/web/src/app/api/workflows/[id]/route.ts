import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

const workflowUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(60).optional(),
  graphJson: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
});

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
  const parsed = workflowUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return json({ error: "Workflow not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.graphJson !== undefined) update.graphJson = parsed.data.graphJson;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;

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

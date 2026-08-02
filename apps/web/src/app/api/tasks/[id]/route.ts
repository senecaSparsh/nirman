import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { updateTaskStatus, reassignTask } from "@nirman/services";
import { apiHandler, getCurrentUser, json, requirePermission, taskStatusSchema } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

/**
 * GET /api/tasks/[id] — full task detail (subtasks, comments, activity, time, deps)
 *   - Assignee + managers+ can view.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignedTo: { select: { id: true } } },
  });
  if (!task) return json({ error: "Task not found" }, { status: 404 });

  const isAssignee = task.assignedToId === user.id;
  const isManager = hasPermission(user.role, PERM.TASKS_ASSIGN);
  if (!isAssignee && !isManager) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  // Re-fetch with full relations via the service.
  const { getTaskDetail } = await import("@nirman/services");
  const detail = await getTaskDetail(taskId);
  if (!detail) return json({ error: "Task not found" }, { status: 404 });

  return json(detail);
});

/**
 * PATCH /api/tasks/[id] — update task status or fields
 *   - Assignee can update status (PENDING → IN_PROGRESS → COMPLETED)
 *   - Managers+ can update all fields
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: taskId } = await params;

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    return json({ error: "Task not found" }, { status: 404 });
  }

  const body = await req.json();
  const isAssignee = existing.assignedToId === user.id;
  const isManager = hasPermission(user.role, PERM.TASKS_ASSIGN);

  if (!isAssignee && !isManager) {
    return json({ error: "Forbidden — you can only update your own tasks" }, { status: 403 });
  }

  // Status changes go through the service (dependency enforcement + activity log).
  if (body.status !== undefined) {
    const statusParsed = taskStatusSchema.safeParse(body.status);
    if (!statusParsed.success) {
      return json({ error: "Invalid status" }, { status: 400 });
    }
    const updated = await updateTaskStatus({ taskId, status: statusParsed.data, userId: user.id });
    return json({ ok: true, id: updated.id, status: updated.status });
  }

  // Reassignment goes through the service (activity log).
  if (body.assignedToId !== undefined && isManager) {
    const updated = await reassignTask({ taskId, assignedToId: body.assignedToId, userId: user.id });
    return json({ ok: true, id: updated.id, status: updated.status });
  }

  // Other content edits (managers only) — direct update.
  const update: Record<string, unknown> = {};
  if (isManager) {
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.instructions !== undefined) update.instructions = body.instructions;
    if (body.priority !== undefined) update.priority = body.priority;
    if (body.estimateMins !== undefined) update.estimateMins = body.estimateMins ?? null;
    if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }

  if (Object.keys(update).length === 0) {
    return json({ ok: true, id: existing.id, status: existing.status });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: update,
  });

  return json({ ok: true, id: updated.id, status: updated.status });
});

/**
 * DELETE /api/tasks/[id] — cancel/delete a task (managers+ only)
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.TASKS_ASSIGN);

  const { id: taskId } = await params;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    return json({ error: "Task not found" }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: taskId } });
  return json({ ok: true });
});

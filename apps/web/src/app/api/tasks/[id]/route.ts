import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCurrentUser, json, requirePermission, taskStatusSchema } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

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

  // Build update data based on what's allowed
  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const statusParsed = taskStatusSchema.safeParse(body.status);
    if (!statusParsed.success) {
      return json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = statusParsed.data;
    if (statusParsed.data === "COMPLETED") {
      update.completedAt = new Date();
    } else {
      update.completedAt = null;
    }
  }

  // Only managers can reassign or edit content
  if (isManager) {
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.instructions !== undefined) update.instructions = body.instructions;
    if (body.priority !== undefined) update.priority = body.priority;
    if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assignedToId !== undefined) update.assignedToId = body.assignedToId;
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

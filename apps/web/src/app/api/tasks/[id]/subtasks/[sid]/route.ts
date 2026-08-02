import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { toggleSubTask, deleteSubTask, reorderSubTasks } from "@nirman/services";
import { apiHandler, getCurrentUser, json } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

/**
 * PATCH /api/tasks/[id]/subtasks/[sid]
 *   body: { completed?: boolean, title?: string, order?: number }
 *   body: { reorder?: string[] }  // ordered list of subtask ids for this task
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId, sid } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedToId: true } });
  if (!task) return json({ error: "Task not found" }, { status: 404 });

  const isAssignee = task.assignedToId === user.id;
  const isManager = hasPermission(user.role, PERM.TASKS_ASSIGN);
  if (!isAssignee && !isManager) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  // Reorder: full ordered list of ids for this task.
  if (Array.isArray(body.reorder)) {
    await reorderSubTasks(taskId, body.reorder as string[], user.id);
    return json({ ok: true });
  }

  if (typeof body.completed === "boolean") {
    const updated = await toggleSubTask(sid, body.completed, user.id);
    return json({ ok: true, id: updated.id, completed: updated.completed });
  }

  if (typeof body.title === "string") {
    const updated = await prisma.subTask.update({ where: { id: sid, taskId }, data: { title: body.title.slice(0, 200) } });
    return json({ ok: true, id: updated.id });
  }

  return json({ error: "Nothing to update" }, { status: 400 });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId, sid } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedToId: true } });
  if (!task) return json({ error: "Task not found" }, { status: 404 });

  const isAssignee = task.assignedToId === user.id;
  const isManager = hasPermission(user.role, PERM.TASKS_ASSIGN);
  if (!isAssignee && !isManager) return json({ error: "Forbidden" }, { status: 403 });

  await deleteSubTask(sid, user.id);
  return json({ ok: true });
});

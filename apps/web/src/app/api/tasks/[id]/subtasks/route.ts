import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { addSubTask } from "@nirman/services";
import { apiHandler, getCurrentUser, json, subTaskSchema } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

/**
 * POST /api/tasks/[id]/subtasks — add a step to a task.
 * Assignee or managers+ may add subtasks.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedToId: true } });
  if (!task) return json({ error: "Task not found" }, { status: 404 });

  const isAssignee = task.assignedToId === user.id;
  const isManager = hasPermission(user.role, PERM.TASKS_ASSIGN);
  if (!isAssignee && !isManager) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = subTaskSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const sub = await addSubTask(taskId, parsed.data.title, user.id);
  return json({ ok: true, id: sub.id }, { status: 201 });
});

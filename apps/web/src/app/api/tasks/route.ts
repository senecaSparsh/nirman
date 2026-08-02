import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createTask } from "@nirman/services";
import { apiHandler, getCurrentUser, json, requirePermission, taskSchema } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

/**
 * GET /api/tasks
 *   - Managers+ see all tasks (with optional ?status=, ?assignee= filters)
 *   - Everyone else sees only tasks assigned to them
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = user.role;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const assigneeId = url.searchParams.get("assignee");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (assigneeId) where.assignedToId = assigneeId;

  // Non-managers only see their own tasks
  if (!hasPermission(role, PERM.TASKS_ASSIGN)) {
    where.assignedToId = user.id;
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      assignedBy: { select: { id: true, name: true } },
      workspace: { select: { id: true, name: true } },
    },
  });

  return json(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      instructions: t.instructions,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? formatDate(t.dueDate) : null,
      dueDateRaw: t.dueDate?.toISOString() ?? null,
      assignedTo: t.assignedTo,
      assignedBy: t.assignedBy,
      workspace: t.workspace,
      nodeLabel: t.nodeLabel,
      completedAt: t.completedAt ? formatDate(t.completedAt) : null,
      createdAt: formatDate(t.createdAt),
    })),
  );
});

/**
 * POST /api/tasks — create a new task (managers+ only)
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.TASKS_ASSIGN);

  const body = await req.json();
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify assignee exists and is active
  const assignee = await prisma.user.findUnique({
    where: { id: parsed.data.assignedToId },
    select: { id: true, active: true, name: true },
  });
  if (!assignee) {
    return json({ error: "Assignee not found" }, { status: 400 });
  }
  if (!assignee.active) {
    return json({ error: "Cannot assign a task to an inactive user" }, { status: 400 });
  }

  const created = await createTask({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    instructions: parsed.data.instructions ?? null,
    assignedToId: parsed.data.assignedToId,
    assignedById: user.id,
    priority: parsed.data.priority,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    workspaceId: parsed.data.workspaceId ?? null,
    nodeLabel: parsed.data.nodeLabel ?? null,
    estimateMins: parsed.data.estimateMins ?? null,
    subtasks: parsed.data.subtasks?.filter((s) => s.trim().length > 0),
    userId: user.id,
  });

  return json({ ok: true, id: created.id }, { status: 201 });
});

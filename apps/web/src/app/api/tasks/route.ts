import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createTask } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, requireUser, taskSchema } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

/**
 * GET /api/tasks
 *   - Managers+ see all tasks (with optional ?status=, ?assignee= filters)
 *   - Everyone else sees only tasks assigned to them
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const role = user.role;
  const company = await getCompany();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const assigneeId = url.searchParams.get("assignee");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (assigneeId) where.assignedToId = assigneeId;

  // Non-managers only see their own tasks
  if (!hasPermission(role, PERM.TASKS_ASSIGN)) {
    where.assignedToId = user.id;
  } else {
    // Managers see tasks for users in their company only (tenant isolation)
    where.assignedTo = { memberships: { some: { companyId: company.id } } };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      assignedBy: { select: { id: true, name: true } },
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
  const company = await getCompany();

  const body = await req.json();
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify assignee exists, is active, and is in the actor's company
  const assignee = await prisma.user.findFirst({
    where: {
      id: parsed.data.assignedToId,
      active: true,
      memberships: { some: { companyId: company.id } },
    },
    select: { id: true, active: true, name: true },
  });
  if (!assignee) {
    return json({ error: "Assignee not found or not in your company" }, { status: 400 });
  }

  const created = await createTask({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    instructions: parsed.data.instructions ?? null,
    assignedToId: parsed.data.assignedToId,
    assignedById: user.id,
    priority: parsed.data.priority,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    estimateMins: parsed.data.estimateMins ?? null,
    subtasks: parsed.data.subtasks?.filter((s) => s.trim().length > 0),
    userId: user.id,
  });

  revalidatePath("/my-tasks");
  revalidatePath("/m/site/tasks");
  return json({ ok: true, id: created.id }, { status: 201 });
});

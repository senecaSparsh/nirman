import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requireUser } from "@/lib/server";
import { formatDate } from "@/lib/utils";

/**
 * GET /api/my-tasks — tasks assigned to the current signed-in user.
 * Returns tasks grouped by status for the dashboard "My Tasks" panel.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const userId = user.id;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = { assignedToId: userId };
  if (status) where.status = status;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: {
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
      assignedBy: t.assignedBy?.name ?? null,
      completedAt: t.completedAt ? formatDate(t.completedAt) : null,
      createdAt: formatDate(t.createdAt),
    })),
  );
});

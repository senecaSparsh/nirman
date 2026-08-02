import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { startTimer, stopTimer } from "@nirman/services";
import { apiHandler, getCurrentUser, json } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { z } from "zod";

const stopSchema = z.object({ note: z.string().max(500).optional() });

/**
 * POST /api/tasks/[id]/time/start — start a timer for the current user.
 * Assignee or managers+.
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

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "start";

  if (action === "stop") {
    const body = await req.json().catch(() => ({}));
    const parsed = stopSchema.safeParse(body);
    const note = parsed.success ? parsed.data.note : undefined;
    const log = await stopTimer(taskId, user.id, note);
    return json({ ok: true, id: log.id, durationMins: log.durationMins });
  }

  const log = await startTimer(taskId, user.id);
  return json({ ok: true, id: log.id }, { status: 201 });
});

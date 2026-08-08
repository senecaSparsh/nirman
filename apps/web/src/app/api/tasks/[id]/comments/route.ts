import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { addComment } from "@nirman/services";
import { apiHandler, requireUser, json } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { z } from "zod";

const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(4000),
  parentId: z.string().optional().nullable(),
});

/**
 * POST /api/tasks/[id]/comments — add a comment (or reply).
 * Any assignee or manager can comment.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedToId: true } });
  if (!task) return json({ error: "Task not found" }, { status: 404 });

  const isAssignee = task.assignedToId === user.id;
  const isManager = hasPermission(user.role, PERM.TASKS_ASSIGN);
  if (!isAssignee && !isManager) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const comment = await addComment(taskId, parsed.data.body, user.id, parsed.data.parentId ?? null);
  return json({ ok: true, id: comment.id }, { status: 201 });
});

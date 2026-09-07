import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { addDependency, removeDependency } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { z } from "zod";

const depSchema = z.object({
  blockerId: z.string().min(1, "Blocker is required"),
});

async function verifyTaskInCompany(taskId: string, companyId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, assignedTo: { memberships: { some: { companyId } } } },
    select: { id: true },
  });
  return !!task;
}

/**
 * POST /api/tasks/[id]/dependencies — mark another task as a blocker of [id].
 * Managers+ only (dependencies are a planning concern).
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  if (!hasPermission(user.role, PERM.TASKS_ASSIGN)) return json({ error: "Forbidden — managers only" }, { status: 403 });
  const company = await getCompany();
  const { id: blockedById } = await params;

  const body = await req.json();
  const parsed = depSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  // Verify both tasks belong to users in the actor's company
  if (!await verifyTaskInCompany(blockedById, company.id)) return json({ error: "Task not found" }, { status: 404 });
  if (!await verifyTaskInCompany(parsed.data.blockerId, company.id)) return json({ error: "Blocker task not found" }, { status: 404 });

  await addDependency(parsed.data.blockerId, blockedById, user.id);
  return json({ ok: true }, { status: 201 });
});

/**
 * DELETE /api/tasks/[id]/dependencies?blockerId=... — remove a blocker.
 */
export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  if (!hasPermission(user.role, PERM.TASKS_ASSIGN)) return json({ error: "Forbidden — managers only" }, { status: 403 });
  const company = await getCompany();
  const { id: blockedById } = await params;

  const url = new URL(req.url);
  const blockerId = url.searchParams.get("blockerId");
  if (!blockerId) return json({ error: "blockerId query param required" }, { status: 400 });

  // Verify both tasks belong to users in the actor's company
  if (!await verifyTaskInCompany(blockedById, company.id)) return json({ error: "Task not found" }, { status: 404 });
  if (!await verifyTaskInCompany(blockerId, company.id)) return json({ error: "Blocker task not found" }, { status: 404 });

  await removeDependency(blockerId, blockedById, user.id);
  return json({ ok: true });
});

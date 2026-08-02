import { NextRequest } from "next/server";
import { addDependency, removeDependency } from "@nirman/services";
import { apiHandler, getCurrentUser, json } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { z } from "zod";

const depSchema = z.object({
  blockerId: z.string().min(1, "Blocker is required"),
});

/**
 * POST /api/tasks/[id]/dependencies — mark another task as a blocker of [id].
 * Managers+ only (dependencies are a planning concern).
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, PERM.TASKS_ASSIGN)) return json({ error: "Forbidden — managers only" }, { status: 403 });
  const { id: blockedById } = await params;

  const body = await req.json();
  const parsed = depSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  await addDependency(parsed.data.blockerId, blockedById, user.id);
  return json({ ok: true }, { status: 201 });
});

/**
 * DELETE /api/tasks/[id]/dependencies?blockerId=... — remove a blocker.
 */
export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, PERM.TASKS_ASSIGN)) return json({ error: "Forbidden — managers only" }, { status: 403 });
  const { id: blockedById } = await params;

  const url = new URL(req.url);
  const blockerId = url.searchParams.get("blockerId");
  if (!blockerId) return json({ error: "blockerId query param required" }, { status: 400 });

  await removeDependency(blockerId, blockedById, user.id);
  return json({ ok: true });
});

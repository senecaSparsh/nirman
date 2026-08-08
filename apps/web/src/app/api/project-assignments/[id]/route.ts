import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.USERS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const { scopedRole } = body;
  if (!scopedRole) return json({ error: "scopedRole is required" }, { status: 400 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const pa = await tx.projectAssignment.update({
        where: { id },
        data: { scopedRole },
      });
      await logAction(tx, {
        userId: user.id,
        action: "PROJECT_ASSIGNMENT_UPDATE",
        entityType: "ProjectAssignment",
        entityId: id,
        after: { scopedRole: pa.scopedRole },
      });
      return pa;
    });
    return json({ ok: true, id: updated.id });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update assignment") }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.USERS_MANAGE);
  const { id } = await params;
  try {
    await prisma.$transaction(async (tx) => {
      const pa = await tx.projectAssignment.findUnique({ where: { id } });
      await tx.projectAssignment.delete({ where: { id } });
      await logAction(tx, {
        userId: user.id,
        action: "PROJECT_ASSIGNMENT_DELETE",
        entityType: "ProjectAssignment",
        entityId: id,
        before: pa ? { scopedRole: pa.scopedRole, projectId: pa.projectId, userId: pa.userId } : undefined,
      });
    });
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete assignment") }, { status: 400 });
  }
});

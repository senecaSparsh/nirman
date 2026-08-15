import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the assignment belongs to a project in the user's company
  const existing = await prisma.projectAssignment.findFirst({
    where: { id, project: { companyId: company.id } },
    select: { id: true },
  });
  if (!existing) {
    return json({ error: "Assignment not found" }, { status: 404 });
  }
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
  const company = await getCompany();
  const { id } = await params;
  // Verify the assignment belongs to a project in the user's company
  const existing = await prisma.projectAssignment.findFirst({
    where: { id, project: { companyId: company.id } },
    select: { id: true, scopedRole: true, projectId: true, userId: true },
  });
  if (!existing) {
    return json({ error: "Assignment not found" }, { status: 404 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectAssignment.delete({ where: { id } });
      await logAction(tx, {
        userId: user.id,
        action: "PROJECT_ASSIGNMENT_DELETE",
        entityType: "ProjectAssignment",
        entityId: id,
        before: { scopedRole: existing.scopedRole, projectId: existing.projectId, userId: existing.userId },
      });
    });
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete assignment") }, { status: 400 });
  }
});

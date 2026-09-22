import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertScopeAllows, canManageSpecificEmployee } from "@/lib/server";
import { restoreEmployee } from "@nirman/services";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/restore — un-archive an employee.
 *
 * Inverse of DELETE: restores the record, re-activates the linked
 * membership + user account, and clears the EmployeeExit record (unique —
 * leaving it would block a future re-termination). The recycled phone is
 * NOT auto-returned — it may have gone to someone else.
 *
 * Guards: hr.manage + scope + hierarchy (same as archive).
 */
export const POST = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  // The record is soft-deleted — scopeWhere on Employee would hide it.
  // Fetch raw, then enforce the same scope + hierarchy checks manually so a
  // scoped/lower-tier actor can't resurrect records they can't see.
  const existing = await prisma.employee.findFirst({
    where: { id, companyId: company.id },
    select: {
      id: true, deletedAt: true, hierarchyLevel: true, userId: true,
      departmentId: true, activeProjectId: true,
      user: { select: { role: true } },
    },
  });
  if (!existing || !existing.deletedAt) {
    return json({ error: "Archived employee not found" }, { status: 404 });
  }
  try {
    await assertScopeAllows({
      departmentId: existing.departmentId,
      projectId: existing.activeProjectId,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  const canManage = await canManageSpecificEmployee(
    { userId: existing.userId, user: existing.user ? { role: existing.user.role } : null, hierarchyLevel: existing.hierarchyLevel },
    user.id,
  );
  if (!canManage) {
    return json({ error: "You cannot manage this employee (hierarchy or role restriction)" }, { status: 403 });
  }

  try {
    await restoreEmployee({ employeeId: id, companyId: company.id, actorUserId: user.id });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Restore failed" }, { status: 400 });
  }
  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
  revalidatePath(`/m/hr/employees/${id}`);
  return json({ ok: true });
});

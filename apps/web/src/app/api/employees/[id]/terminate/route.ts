import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { terminateEmployee, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, canManageSpecificEmployee, getCurrentUser, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/terminate — terminate an employee.
 *
 * This is a permanent action that:
 *   1. Soft-deletes the Employee (deletedAt = now, active = false) — all
 *      history (attendance, payroll, DPR, calls) is preserved.
 *   2. Disables the linked User account (active = false) — no more login.
 *   3. Recycles the assigned CompanyPhone (status = RECYCLED, unassigned) —
 *      the number returns to the pool and can be re-assigned.
 *
 * Body: {
 *   reason?: string,
 *   employmentEndDate?: string,
 *   finalSettlementAmount?: number,
 *   leaveEncashmentDays?: number,
 *   leaveEncashmentAmount?: number,
 *   assetsReturned?: boolean,
 *   assetsReturnNotes?: string,
 *   exitInterviewConducted?: boolean,
 *   exitInterviewNotes?: string,
 *   pfExitFiled?: boolean,
 *   esiExitFiled?: boolean,
 * }
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // ── Hierarchy check: viewer must be above this employee ──
  const currentUser = await getCurrentUser();
  if (currentUser) {
    const target = await prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
      select: { userId: true, hierarchyLevel: true, user: { select: { role: true } } },
    });
    if (!target) return json({ error: "Employee not found" }, { status: 404 });
    const canEdit = await canManageSpecificEmployee(
      { userId: target.userId, user: target.user ? { role: target.user.role } : null, hierarchyLevel: target.hierarchyLevel },
      currentUser.id,
    );
    if (!canEdit) return json({ error: "You cannot terminate this employee (hierarchy or role restriction)" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    reason,
    employmentEndDate,
    finalSettlementAmount,
    leaveEncashmentDays,
    leaveEncashmentAmount,
    assetsReturned,
    assetsReturnNotes,
    exitInterviewConducted,
    exitInterviewNotes,
    pfExitFiled,
    esiExitFiled,
  } = body as {
    reason?: string;
    employmentEndDate?: string;
    finalSettlementAmount?: number | null;
    leaveEncashmentDays?: number | null;
    leaveEncashmentAmount?: number | null;
    assetsReturned?: boolean | null;
    assetsReturnNotes?: string | null;
    exitInterviewConducted?: boolean | null;
    exitInterviewNotes?: string | null;
    pfExitFiled?: boolean | null;
    esiExitFiled?: boolean | null;
  };

  try {
    const result = await terminateEmployee({
      employeeId: id,
      companyId: company.id,
      actorUserId: session.id,
      reason: reason ?? "Terminated",
      employmentEndDate: employmentEndDate ?? null,
      finalSettlementAmount: finalSettlementAmount ?? null,
      leaveEncashmentDays: leaveEncashmentDays ?? null,
      leaveEncashmentAmount: leaveEncashmentAmount ?? null,
      assetsReturned: assetsReturned ?? null,
      assetsReturnNotes: assetsReturnNotes ?? null,
      exitInterviewConducted: exitInterviewConducted ?? null,
      exitInterviewNotes: exitInterviewNotes ?? null,
      pfExitFiled: pfExitFiled ?? null,
      esiExitFiled: esiExitFiled ?? null,
    });

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr?tab=employees");
    revalidatePath("/settings/people");

    const phoneMsg = result.recycledPhoneId
      ? " Their phone number has been recycled and is available for re-assignment."
      : "";

    return json({
      ok: true,
      ...result,
      message: `Employee terminated. All history is preserved.${phoneMsg}`,
    });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});

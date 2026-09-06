import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { terminateEmployee, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
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
 * Body: { reason?: string, employmentEndDate?: string }
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const { reason, employmentEndDate } = body as { reason?: string; employmentEndDate?: string };

  try {
    const result = await terminateEmployee({
      employeeId: id,
      companyId: company.id,
      actorUserId: session.id,
      reason: reason ?? "Terminated",
      employmentEndDate: employmentEndDate ?? null,
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

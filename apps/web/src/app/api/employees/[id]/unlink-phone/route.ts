import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { unlinkEmployeePhone, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/unlink-phone — return the employee's assigned
 * phone number to the pool (status = RECYCLED). The number can then be
 * re-assigned to another employee.
 *
 * Body: { reason?: string }
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const { reason } = body as { reason?: string };

  try {
    const result = await unlinkEmployeePhone(id, company.id, session.id, reason);

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);

    return json({ ok: true, ...result });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});

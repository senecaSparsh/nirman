import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { confirmEmploymentAgreement, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/confirm-agreement — mark the employment
 * agreement as CONFIRMED (employee has signed/agreed). This unlocks
 * auto-deposit setup.
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    const result = await confirmEmploymentAgreement(id, company.id, session.id);

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);

    return json({
      ok: true,
      ...result,
      message: "Agreement confirmed. You can now set up auto-deposit (salary → bank).",
    });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});

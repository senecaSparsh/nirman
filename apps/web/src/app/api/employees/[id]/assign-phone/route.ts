import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { assignPhoneToEmployee, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/assign-phone — assign or create a company phone
 * number for an employee's linked account. The employee must already have
 * a linked User account.
 *
 * Body: {
 *   companyPhoneId?: string,   // existing number to assign
 *   newPhoneNumber?: string,   // OR a new number to add + assign
 *   newPhoneLabel?: string,
 *   newPhoneDepartment?: string,
 *   newPhoneMonthlyCost?: number,
 *   newPhoneProvider?: string,
 * }
 *
 * Requires HR_MANAGE + TELEPHONY_MANAGE.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json();
  const {
    companyPhoneId,
    newPhoneNumber,
    newPhoneLabel,
    newPhoneDepartment,
    newPhoneMonthlyCost,
    newPhoneProvider,
  } = body as {
    companyPhoneId?: string;
    newPhoneNumber?: string;
    newPhoneLabel?: string;
    newPhoneDepartment?: string;
    newPhoneMonthlyCost?: number;
    newPhoneProvider?: string;
  };

  if (!companyPhoneId && !newPhoneNumber) {
    return json(
      { error: "Either companyPhoneId or newPhoneNumber is required." },
      { status: 400 },
    );
  }

  try {
    const result = await assignPhoneToEmployee({
      employeeId: id,
      companyId: company.id,
      actorUserId: session.id,
      companyPhoneId: companyPhoneId || null,
      newPhoneNumber: newPhoneNumber?.trim() || null,
      newPhoneLabel: newPhoneLabel || null,
      newPhoneDepartment: newPhoneDepartment || null,
      newPhoneMonthlyCost: newPhoneMonthlyCost ?? null,
      newPhoneProvider: newPhoneProvider || null,
    });

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

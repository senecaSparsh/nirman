import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { setupAutoDeposit, disableAutoDeposit, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/setup-deposit — configure auto-deposit (salary
 * auto-credited to the employee's bank account on payday). Requires the
 * employment agreement to be CONFIRMED first.
 *
 * Body: {
 *   bankAccountHolder: string,
 *   bankAccountNumber: string,
 *   bankIfsc: string,
 *   bankName: string,
 *   bankBranch?: string,
 *   payDay: number,  // 1-31
 * }
 *
 * Or: { disable: true } to disable auto-deposit.
 *
 * Requires PAYROLL_MANAGE.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.PAYROLL_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const body = await req.json();

  // Disable mode
  if (body.disable === true) {
    try {
      const result = await disableAutoDeposit(id, company.id, session.id);
      revalidatePath(`/hr/employees/${id}`);
      revalidatePath(`/m/hr/employees/${id}`);
      return json({ ok: true, ...result, message: "Auto-deposit disabled." });
    } catch (err: unknown) {
      if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
      throw err;
    }
  }

  // Setup mode
  const {
    bankAccountHolder,
    bankAccountNumber,
    bankIfsc,
    bankName,
    bankBranch,
    payDay,
  } = body as {
    bankAccountHolder?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankName?: string;
    bankBranch?: string;
    payDay?: number;
  };

  if (!bankAccountHolder?.trim()) return json({ error: "Bank account holder name is required." }, { status: 400 });
  if (!bankAccountNumber?.trim()) return json({ error: "Bank account number is required." }, { status: 400 });
  if (!bankIfsc?.trim()) return json({ error: "Bank IFSC code is required." }, { status: 400 });
  if (!bankName?.trim()) return json({ error: "Bank name is required." }, { status: 400 });
  if (payDay === undefined || payDay < 1 || payDay > 31) {
    return json({ error: "Pay day must be between 1 and 31." }, { status: 400 });
  }

  try {
    const result = await setupAutoDeposit(id, company.id, session.id, {
      bankAccountHolder: bankAccountHolder.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
      bankIfsc: bankIfsc.trim(),
      bankName: bankName.trim(),
      bankBranch: bankBranch?.trim() || null,
      payDay,
    });

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);

    return json({
      ok: true,
      ...result,
      message: `Auto-deposit enabled. Salary will be credited on the ${payDay}th of each month.`,
    });
  } catch (err: unknown) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});

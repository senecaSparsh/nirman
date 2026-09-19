import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { setSalaryComponents, autoCompleteOnboarding, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, requireAnyPermission, salaryComponentsSetSchema, toNum, assertCanManageEmployee, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/salary-components — list all salary components
 * for this employee (the CTC breakdown). Compensation data — payroll.manage
 * or hr.manage only (matches canSeePayroll on the pages).
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  // Read gate mirrors canSeePayroll — payroll.view is the read-only comp tier.
  await requireAnyPermission(PERM.PAYROLL_VIEW, PERM.PAYROLL_MANAGE, PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  const components = await prisma.salaryComponent.findMany({
    where: { employeeId: id, active: true },
    orderBy: [{ isDeduction: "asc" }, { type: "asc" }],
  });

  // Compute CTC. UNIT_RATE components are variable (rate × actual usage —
  // e.g. ₹3/km) so they have no fixed monthly/annual value and are excluded
  // from the totals.
  const isVariable = (c: (typeof components)[number]) => c.calculationType === "UNIT_RATE";
  const monthlyEarnings = components
    .filter((c) => !c.isDeduction && c.frequency === "MONTHLY" && !isVariable(c))
    .reduce((sum, c) => sum + toNum(c.amount), 0);
  const monthlyDeductions = components
    .filter((c) => c.isDeduction && c.frequency === "MONTHLY" && !isVariable(c))
    .reduce((sum, c) => sum + toNum(c.amount), 0);
  const annualEarnings = components
    .filter((c) => !c.isDeduction && !isVariable(c))
    .reduce((sum, c) => {
      const amt = toNum(c.amount);
      if (c.frequency === "MONTHLY") return sum + amt * 12;
      if (c.frequency === "QUARTERLY") return sum + amt * 4;
      if (c.frequency === "HALF_YEARLY") return sum + amt * 2;
      if (c.frequency === "YEARLY") return sum + amt;
      if (c.frequency === "ONE_TIME") return sum + amt;
      return sum;
    }, 0);

  return json({
    components: components.map((c) => ({
      id: c.id,
      type: c.type,
      amount: toNum(c.amount),
      frequency: c.frequency,
      isDeduction: c.isDeduction,
      isPercentage: c.isPercentage,
      percentageOfBasic: c.percentageOfBasic ? toNum(c.percentageOfBasic) : null,
      calculationType: c.calculationType,
      unitType: c.unitType,
      unitLabel: c.unitLabel,
      notes: c.notes,
    })),
    summary: {
      monthlyGross: monthlyEarnings,
      monthlyDeductions,
      monthlyNet: monthlyEarnings - monthlyDeductions,
      annualCTC: annualEarnings,
    },
  });
});

/**
 * PUT /api/employees/[id]/salary-components — batch-set (replace) all
 * salary components for this employee. Used by the hiring form and
 * the salary structure editor.
 *
 * Body: { components: [{ type, amount, frequency, isDeduction, isPercentage, percentageOfBasic, notes }] }
 */
export const PUT = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = salaryComponentsSetSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const result = await setSalaryComponents(
      id,
      company.id,
      session.id,
      parsed.data.components.map((c) => ({ ...c, employeeId: id, type: c.type as never })),
      { changedBy: session.id },
    );
    await autoCompleteOnboarding(id, company.id).catch(() => {});
    revalidatePath(`/m/hr/employees/${id}`);
    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/onboarding/${id}`);
    revalidatePath("/m/hr/onboarding");
    return json({ ok: true, count: result.length });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});

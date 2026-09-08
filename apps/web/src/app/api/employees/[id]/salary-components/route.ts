import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { setSalaryComponents, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/salary-components — list all salary components
 * for this employee (the CTC breakdown).
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  const components = await prisma.salaryComponent.findMany({
    where: { employeeId: id, active: true },
    orderBy: [{ isDeduction: "asc" }, { type: "asc" }],
  });

  // Compute CTC
  const monthlyEarnings = components
    .filter((c) => !c.isDeduction && c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + toNum(c.amount), 0);
  const monthlyDeductions = components
    .filter((c) => c.isDeduction && c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + toNum(c.amount), 0);
  const annualEarnings = components
    .filter((c) => !c.isDeduction)
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

  const body = await req.json();
  const components = body.components;
  if (!Array.isArray(components)) {
    return json({ error: "components must be an array" }, { status: 400 });
  }

  try {
    const result = await setSalaryComponents(id, company.id, session.id, components, {
      changedBy: session.id,
    });
    return json({ ok: true, count: result.length });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});

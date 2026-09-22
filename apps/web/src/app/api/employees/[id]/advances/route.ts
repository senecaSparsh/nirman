import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere, assertCanManageEmployee } from "@/lib/server";
import { issueAdvance, listEmployeeAdvances, HrError } from "@nirman/services";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/advances — the employee's advance/loan ledger.
 * hr.view-scoped; the employee must be in the caller's scope.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });
  const advances = await listEmployeeAdvances(id, company.id);
  return json({
    advances: advances.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      monthlyRecovery: Number(a.monthlyRecovery),
      recoveredAmount: Number(a.recoveredAmount),
      outstanding: Number(a.amount) - Number(a.recoveredAmount),
      status: a.status,
      issueDate: a.issueDate,
      notes: a.notes,
      issuedBy: a.issuedBy?.name ?? null,
    })),
  });
});

/**
 * POST /api/employees/[id]/advances — issue a salary advance.
 * hr.manage + full employee-manage checks (scope, H1 wall, held-set
 * protection) — a junior can't issue an advance to a senior's record.
 * Body: { amount, monthlyRecovery, notes? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { amount, monthlyRecovery, notes } = body as {
    amount?: number;
    monthlyRecovery?: number;
    notes?: string;
  };
  try {
    const advance = await issueAdvance({
      employeeId: id,
      companyId: company.id,
      amount: Number(amount),
      monthlyRecovery: Number(monthlyRecovery),
      notes: notes ?? null,
      actorUserId: user.id,
    });
    return json({ ok: true, id: advance.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});

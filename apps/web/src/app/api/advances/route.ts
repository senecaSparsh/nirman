import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { listCompanyAdvances } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";

/**
 * GET /api/advances — the company advance ledger for HR books.
 * hr.manage; scoped callers see only advances for employees in their scope
 * (dept-scoped HR can't browse advances outside their departments).
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  // Resolve the visible employee set through the standard scope filter.
  const visible = await prisma.employee.findMany({
    where: { companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true },
  });
  const advances = await listCompanyAdvances(company.id, visible.map((e) => e.id));
  return json({
    advances: advances.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee.name,
      designation: a.employee.designation,
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

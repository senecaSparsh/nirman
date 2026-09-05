import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/account — fetch the linked User account details
 * for an employee (for the "Login Account" card on the profile).
 *
 * Returns: { userId, user, companyPhone, membership } or { userId: null }
 * if no account is linked.
 *
 * Requires HR_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          active: true,
          employeeCode: true,
          designation: true,
          department: true,
          joiningDate: true,
          employmentEndDate: true,
          image: true,
          lastLoginAt: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  if (!employee.userId || !employee.user) {
    return json({ userId: null, user: null, companyPhone: null, membership: null });
  }

  // Fetch the membership + permissions + scope
  const membership = await prisma.userCompany.findFirst({
    where: { userId: employee.userId, companyId: company.id },
    select: {
      id: true,
      role: true,
      scopeType: true,
      reportsToUserCompanyId: true,
      userPermissions: { select: { permission: true } },
      scopes: {
        select: {
          scopeKind: true,
          departmentId: true,
          projectId: true,
          department: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Fetch the assigned company phone
  const companyPhone = await prisma.companyPhone.findFirst({
    where: { assignedToUserId: employee.userId, companyId: company.id, deletedAt: null },
    select: {
      id: true,
      phoneNumber: true,
      label: true,
      department: true,
      status: true,
      monthlyCost: true,
      provider: true,
    },
  });

  return json({
    userId: employee.userId,
    user: employee.user,
    membership,
    companyPhone,
  });
});

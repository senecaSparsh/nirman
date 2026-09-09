import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCompanyGroupIds, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/add-to-company
 *
 * Adds an existing employee to another company in the owner's company group.
 * Copies personal data (name, phone, email, trade, designation, hierarchy,
 * bank, statutory, emergency contact, address, identity) from the source
 * employee to a new Employee record in the target company. Per-company fields
 * (department, project, crew, salary) are NOT copied — the target company's
 * HR sets those during onboarding.
 *
 * If the employee has a linked User account, a UserCompany membership is
 * created in the target company so the user can switch to it via the
 * header company switcher.
 *
 * Gating:
 * - Requires hr.manage permission
 * - Target company must be in the viewer's company group (parent + children)
 * - Employee must not already have a record in the target company
 * - Viewer must have COMPANY scope (only owners/admins can add across companies)
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id: employeeId } = await ctx.params;
  const body = await req.json();
  const targetCompanyId = body.targetCompanyId as string | undefined;

  if (!targetCompanyId) {
    return json({ error: "Target company ID is required" }, { status: 400 });
  }

  // ── Validate target company is in the viewer's company group ──
  const groupIds = await getCompanyGroupIds();
  if (!groupIds.includes(targetCompanyId)) {
    return json({ error: "You can only add employees to companies in your group" }, { status: 403 });
  }

  // ── Fetch the source employee (scoped to the current company) ──
  const sourceEmployee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
  });
  if (!sourceEmployee) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  // ── Check the employee doesn't already have a record in the target company ──
  const existing = await prisma.employee.findFirst({
    where: {
      userId: sourceEmployee.userId,
      companyId: targetCompanyId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    return json({ error: "This employee already has a record in the target company" }, { status: 409 });
  }

  // ── Create the new Employee record in the target company ──
  // Copy personal data only. Per-company fields (department, project, crew,
  // salary, reporting location) are left null — the target company's HR
  // assigns them during onboarding.
  const newEmployee = await prisma.employee.create({
    data: {
      name: sourceEmployee.name,
      trade: sourceEmployee.trade,
      phone: sourceEmployee.phone,
      email: sourceEmployee.email,
      // Wage defaults — target company sets real salary during onboarding
      dailyRate: 0,
      wageType: sourceEmployee.wageType,
      monthlySalary: null,
      designation: sourceEmployee.designation,
      // Per-company fields — NOT copied
      departmentId: null,
      joinDate: sourceEmployee.joinDate,
      // crewId, activeProjectId, reportingLocationId — NOT copied (company-specific)
      hierarchyLevel: sourceEmployee.hierarchyLevel,
      active: true,
      userId: sourceEmployee.userId,
      companyId: targetCompanyId,
      // Employment terms — copied (same employment contract)
      employmentType: sourceEmployee.employmentType,
      probationEndDate: sourceEmployee.probationEndDate,
      confirmationDate: sourceEmployee.confirmationDate,
      noticePeriodDays: sourceEmployee.noticePeriodDays,
      contractStartDate: sourceEmployee.contractStartDate,
      contractEndDate: sourceEmployee.contractEndDate,
      // Bank details — copied (same bank account)
      payDay: sourceEmployee.payDay,
      bankAccountHolder: sourceEmployee.bankAccountHolder,
      bankAccountNumber: sourceEmployee.bankAccountNumber,
      bankIfsc: sourceEmployee.bankIfsc,
      bankName: sourceEmployee.bankName,
      bankBranch: sourceEmployee.bankBranch,
      // Statutory IDs — copied (PAN, Aadhaar, PF, ESI, UAN are personal)
      panNumber: sourceEmployee.panNumber,
      aadhaarNumber: sourceEmployee.aadhaarNumber,
      pfNumber: sourceEmployee.pfNumber,
      esiNumber: sourceEmployee.esiNumber,
      uan: sourceEmployee.uan,
      // Emergency contact — copied
      emergencyContactName: sourceEmployee.emergencyContactName,
      emergencyContactPhone: sourceEmployee.emergencyContactPhone,
      emergencyContactRelation: sourceEmployee.emergencyContactRelation,
      // Addresses — copied
      permanentAddress: sourceEmployee.permanentAddress,
      currentAddress: sourceEmployee.currentAddress,
      // Identity / personal — copied
      dateOfBirth: sourceEmployee.dateOfBirth,
      bloodGroup: sourceEmployee.bloodGroup,
      photoUrl: sourceEmployee.photoUrl,
    },
  });

  // ── Create UserCompany membership if the employee has a linked user ──
  // This lets the employee switch to the target company via the header
  // company switcher. The role defaults to the employee's existing role
  // in the source company (or MANAGER if no role is set).
  if (sourceEmployee.userId) {
    const sourceMembership = await prisma.userCompany.findFirst({
      where: { userId: sourceEmployee.userId, companyId: company.id },
      select: { role: true },
    });
    const targetRole = sourceMembership?.role ?? "MANAGER";

    // Check if membership already exists (shouldn't, but be safe)
    const existingMembership = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: { userId: sourceEmployee.userId, companyId: targetCompanyId },
      },
      select: { id: true },
    });

    if (!existingMembership) {
      await prisma.userCompany.create({
        data: {
          userId: sourceEmployee.userId,
          companyId: targetCompanyId,
          role: targetRole,
        },
      });
    }
  }

  // ── Audit log ──
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      companyId: company.id,
      action: "EMPLOYEE_ADD_TO_COMPANY",
      entityType: "Employee",
      entityId: newEmployee.id,
      before: { sourceEmployeeId: sourceEmployee.id, sourceCompanyId: company.id },
      after: { targetCompanyId, newEmployeeId: newEmployee.id },
    },
  });

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
  revalidatePath(`/m/hr/employees/${employeeId}`);
  revalidatePath(`/hr/employees/${employeeId}`);

  return json({
    ok: true,
    newEmployeeId: newEmployee.id,
    targetCompanyId,
    message: "Employee added to company. Complete onboarding to finish.",
  }, { status: 201 });
});

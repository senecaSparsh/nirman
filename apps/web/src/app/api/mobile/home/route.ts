import { prisma } from "@nirman/db";
import { apiHandler, json, getCurrentUser, getCompany } from "@/lib/server";
import { PERM, hasPermission, roleTier } from "@/lib/roles";
import { getUserRole } from "@/lib/server";

/**
 * GET /api/mobile/home — returns everything the mobile home page needs
 * in a single request. Used by high-tier devices that fetch client-side
 * instead of relying on SSR (saves server RAM).
 *
 * Returns:
 * - currentCompany: { id, name, businessType, currency }
 * - companies: CompanyCardData[] (with project/land/employee counts)
 * - canCreateCompany: boolean
 * - myEmployee: { id, name } | null
 * - myAttendance: { checkIn, checkOut, hoursWorked, status } | null
 */
export const GET = apiHandler(async () => {
  const [company, user, role] = await Promise.all([
    getCompany(),
    getCurrentUser(),
    getUserRole(),
  ]);

  const canCreateCompany =
    hasPermission(role, PERM.COMPANY_MANAGE) && !company.parentCompanyId;
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";

  let memberships;
  if (user && !isDevBypass) {
    memberships = await prisma.userCompany.findMany({
      where: { userId: user.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            businessType: true,
            currency: true,
            deletedAt: true,
            _count: {
              select: {
                projects: { where: { deletedAt: null } },
                landPurchases: true,
                employees: { where: { active: true } },
              },
            },
          },
        },
      },
    });
    memberships = memberships.filter((m) => m.company.deletedAt === null);
  } else {
    const allCompanies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        businessType: true,
        currency: true,
        _count: {
          select: {
            projects: { where: { deletedAt: null } },
            landPurchases: true,
            employees: { where: { active: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    memberships = allCompanies.map((c) => ({ role: "OWNER", company: c }));
  }

  if (memberships.length === 0) {
    const c = await prisma.company.findFirst({
      where: { id: company.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        businessType: true,
        currency: true,
        _count: {
          select: {
            projects: { where: { deletedAt: null } },
            landPurchases: true,
            employees: { where: { active: true } },
          },
        },
      },
    });
    if (c) {
      memberships = [{ role: "OWNER", company: c }];
    }
  }

  const companies = memberships.map((m: { company: { id: string; name: string; businessType: string | null; currency: string; _count: { projects: number; landPurchases: number; employees: number } } }) => ({
    id: m.company.id,
    name: m.company.name,
    businessType: m.company.businessType,
    currency: m.company.currency,
    projectCount: m.company._count.projects,
    landCount: m.company._count.landPurchases,
    employeeCount: m.company._count.employees,
  }));

  // Self-check-in data — only for field/execution staff (tier 4+)
  // Executives and senior management don't need GPS attendance tracking.
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const isFieldStaff = roleTier(role) >= 4;
  const myEmployee = user && isFieldStaff
    ? await prisma.employee.findFirst({
        where: { userId: user.id, companyId: company.id, deletedAt: null, active: true },
        select: { id: true, name: true },
      })
    : null;

  const myAttendance = myEmployee
    ? await prisma.workerAttendance.findFirst({
        where: {
          employeeId: myEmployee.id,
          date: { gte: startOfToday, lt: endOfToday },
        },
        select: { checkIn: true, checkOut: true, hoursWorked: true, status: true },
      })
    : null;

  return json({
    currentCompany: {
      id: company.id,
      name: company.name,
      businessType: company.businessType,
      currency: company.currency,
    },
    companies,
    canCreateCompany,
    userName: user?.name ?? null,
    myEmployee: myEmployee
      ? { id: myEmployee.id, name: myEmployee.name }
      : null,
    myAttendance: myAttendance
      ? {
          checkIn: myAttendance.checkIn?.toISOString() ?? null,
          checkOut: myAttendance.checkOut?.toISOString() ?? null,
          hoursWorked: myAttendance.hoursWorked ? Number(myAttendance.hoursWorked) : null,
          status: myAttendance.status,
        }
      : null,
  });
});

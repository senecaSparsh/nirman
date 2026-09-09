import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileEmployeeDetailClient } from "./MobileEmployeeDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export default function MobileEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileEmployeeDetailContent params={params} />
    </Suspense>
  );
}

async function MobileEmployeeDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.HR_MANAGE);
  const { id } = await params;

  // Hierarchical RBAC: a PROJECT-scoped user only sees employees on their sites.
  const scope = await getUserScope();
  const employeeProjectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { activeProjectId: { in: scope.projectIds } }
      : {};

  const [employee, projects, stockLocations] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null, ...employeeProjectFilter },
      include: {
        crew: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        activeProject: { select: { id: true, name: true } },
        reportingLocation: { select: { id: true, name: true } },
        user: {
          select: {
            id: true, name: true, email: true, role: true, phone: true, image: true,
            employeeCode: true, designation: true, department: true,
            joiningDate: true, employmentEndDate: true, active: true, lastLoginAt: true,
          },
        },
        salaryComponents: {
          where: { active: true },
          orderBy: [{ isDeduction: "asc" }, { type: "asc" }],
        },
        benefits: {
          where: { active: true },
          orderBy: { type: "asc" },
        },
        supervisedCrews: {
          select: {
            id: true, name: true, active: true,
            project: { select: { id: true, name: true } },
            _count: { select: { members: true } },
          },
        },
        attendances: {
          orderBy: { date: "desc" },
          take: 60,
          include: { project: { select: { id: true, name: true } } },
        },
        payrollLines: {
          orderBy: { payrollPeriod: { year: "desc" } },
          take: 24,
          include: {
            payrollPeriod: {
              select: {
                id: true, month: true, year: true, status: true, paidAt: true,
              },
            },
          },
        },
        dprLaborLines: {
          orderBy: { dpr: { date: "desc" } },
          take: 30,
          include: {
            dpr: {
              select: {
                id: true, date: true, approvalStatus: true, workType: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
        leaveRequests: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { approvedBy: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!employee) {
    return (
      <>
        <MobileEmployeeDetailClient notFound canManage={canManage} actorRole={role} projects={projects} stockLocations={stockLocations} potentialManagers={[]} />
      </>
    );
  }

  // ── Lazy contract expiry check (same as desktop) ──
  if (
    employee.contractEndDate &&
    employee.contractEndDate < new Date() &&
    (employee.contractStatus === "ISSUED" || employee.contractStatus === "CONFIRMED") &&
    employee.active
  ) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { contractStatus: "EXPIRED" },
    });
    employee.contractStatus = "EXPIRED";
  }

  // ── Reporting line (UserCompany.reportsTo) ──
  let reportsTo: { membershipId: string; userId: string; name: string; role: string } | null = null;
  let directReports: { membershipId: string; userId: string; name: string; role: string }[] = [];
  let reportsToMembershipId: string | null = null;
  let potentialManagers: { membershipId: string; userId: string; name: string; role: string }[] = [];
  if (employee.userId) {
    const [membership, otherMembers] = await Promise.all([
      prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: employee.userId, companyId: company.id } },
        include: {
          reportsTo: { include: { user: { select: { id: true, name: true } } } },
          directReports: { include: { user: { select: { id: true, name: true } } } },
        },
      }),
      prisma.userCompany.findMany({
        where: { companyId: company.id, userId: { not: employee.userId } },
        orderBy: { user: { name: "asc" } },
        select: {
          id: true, role: true,
          user: { select: { id: true, name: true, active: true } },
        },
      }),
    ]);
    if (membership) {
      reportsToMembershipId = membership.reportsToUserCompanyId;
      if (membership.reportsTo) {
        reportsTo = {
          membershipId: membership.reportsTo.id,
          userId: membership.reportsTo.user.id,
          name: membership.reportsTo.user.name,
          role: membership.reportsTo.role,
        };
      }
      directReports = membership.directReports.map((r) => ({
        membershipId: r.id,
        userId: r.userId,
        name: r.user.name,
        role: r.role,
      }));
    }
    potentialManagers = otherMembers
      .filter((m) => m.user.active)
      .map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        role: m.role,
      }));
  }

  // Tasks are assigned to the linked User.
  let tasks: Array<{
    id: string; title: string; status: string; priority: string;
    dueDate: string | null; completedAt: string | null; assignedByName: string | null;
  }> = [];
  if (employee.userId) {
    const taskRows = await prisma.task.findMany({
      where: { assignedToId: employee.userId, assignedTo: { memberships: { some: { companyId: company.id } } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { assignedBy: { select: { name: true } } },
    });
    tasks = taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      assignedByName: t.assignedBy?.name ?? null,
    }));
  }

  const recent30 = employee.attendances.slice(0, 30);
  const presentDays = recent30.filter((a) => a.status === "PRESENT" || a.status === "OVERTIME").length;
  const halfDays = recent30.filter((a) => a.status === "HALF_DAY").length;
  const lateDays = recent30.filter((a) => a.status === "LATE").length;
  const absentDays = recent30.filter((a) => a.status === "ABSENT").length;

  const payrollHistory = employee.payrollLines.map((l) => ({
    id: l.id,
    month: l.payrollPeriod.month,
    year: l.payrollPeriod.year,
    status: l.payrollPeriod.status,
    daysWorked: toNum(l.daysWorked),
    grossPay: toNum(l.grossPay),
    totalDeductions: toNum(l.totalDeductions),
    netPay: toNum(l.netPay),
    paidAt: l.payrollPeriod.paidAt?.toISOString() ?? null,
  }));
  const totalNetPaid = payrollHistory.filter((p) => p.status === "PAID").reduce((s, p) => s + p.netPay, 0);

  const leaveHistory = employee.leaveRequests.map((l) => ({
    id: l.id,
    type: l.type,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    days: toNum(l.days),
    reason: l.reason,
    status: l.status,
    approvedByName: l.approvedBy?.name ?? null,
  }));

  const dprHistory = employee.dprLaborLines.map((d) => ({
    id: d.id,
    date: d.dpr.date.toISOString(),
    projectName: d.dpr.project?.name ?? null,
    workType: d.dpr.workType,
    approvalStatus: d.dpr.approvalStatus,
    hoursWorked: toNum(d.hoursWorked),
    taskDescription: d.taskDescription,
  }));
  const totalDprHours = dprHistory.reduce((s, d) => s + d.hoursWorked, 0);

  const data = {
    id: employee.id,
    name: employee.name,
    trade: employee.trade,
    designation: employee.designation,
    phone: employee.phone,
    email: employee.email,
    wageType: employee.wageType as "DAILY" | "MONTHLY" | "FIXED",
    dailyRate: employee.dailyRate != null ? toNum(employee.dailyRate) : null,
    monthlySalary: employee.monthlySalary != null ? toNum(employee.monthlySalary) : null,
    joinDate: employee.joinDate ? employee.joinDate.toISOString() : null,
    hierarchyLevel: employee.hierarchyLevel,
    active: employee.active,
    crewName: employee.crew?.name ?? null,
    crewProjectName: employee.crew?.project?.name ?? null,
    activeProjectName: employee.activeProject?.name ?? null,
    activeProjectId: employee.activeProjectId,
    reportingLocationName: employee.reportingLocation?.name ?? null,
    reportingLocationId: employee.reportingLocationId,
    userId: employee.userId,
    contractStatus: employee.contractStatus,
    contractIssuedAt: employee.contractIssuedAt ? employee.contractIssuedAt.toISOString() : null,
    contractConfirmedAt: employee.contractConfirmedAt ? employee.contractConfirmedAt.toISOString() : null,
    offerLetterStatus: employee.offerLetterStatus,
    offerLetterIssuedAt: employee.offerLetterIssuedAt ? employee.offerLetterIssuedAt.toISOString() : null,
    idCardStatus: employee.idCardStatus,
    idCardIssuedAt: employee.idCardIssuedAt ? employee.idCardIssuedAt.toISOString() : null,
    appointmentLetterStatus: employee.appointmentLetterStatus,
    appointmentLetterIssuedAt: employee.appointmentLetterIssuedAt ? employee.appointmentLetterIssuedAt.toISOString() : null,
    documentsSubmitted: employee.documentsSubmitted,
    backgroundVerified: employee.backgroundVerified,
    onboardingComplete: employee.onboardingComplete,
    dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.toISOString() : null,
    bloodGroup: employee.bloodGroup,
    photoUrl: employee.photoUrl,
    autoDepositEnabled: employee.autoDepositEnabled,
    payDay: employee.payDay,
    bankName: employee.bankName,
    bankAccountNumber: employee.bankAccountNumber,
    employmentType: employee.employmentType,
    noticePeriodDays: employee.noticePeriodDays,
    contractStartDate: employee.contractStartDate ? employee.contractStartDate.toISOString() : null,
    contractEndDate: employee.contractEndDate ? employee.contractEndDate.toISOString() : null,
    salaryComponents: employee.salaryComponents.map((c) => ({
      id: c.id,
      type: c.type,
      amount: toNum(c.amount),
      frequency: c.frequency,
      isDeduction: c.isDeduction,
      isPercentage: c.isPercentage,
      percentageOfBasic: c.percentageOfBasic ? toNum(c.percentageOfBasic) : null,
      notes: c.notes,
      active: c.active,
    })),
    benefits: employee.benefits.map((b) => ({
      id: b.id,
      type: b.type,
      amount: b.amount ? toNum(b.amount) : null,
      frequency: b.frequency,
      startDate: b.startDate ? b.startDate.toISOString() : null,
      endDate: b.endDate ? b.endDate.toISOString() : null,
      notes: b.notes,
      active: b.active,
    })),
    user: employee.user
      ? {
          email: employee.user.email,
          role: employee.user.role,
          phone: employee.user.phone,
          image: employee.user.image,
          employeeCode: employee.user.employeeCode,
          department: employee.user.department,
          joiningDate: employee.user.joiningDate ? employee.user.joiningDate.toISOString() : null,
          active: employee.user.active,
          lastLoginAt: employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
        }
      : null,
    supervisedCrews: employee.supervisedCrews.map((c) => ({
      id: c.id, name: c.name, active: c.active,
      projectName: c.project?.name ?? null, memberCount: c._count.members,
    })),
    attendances: employee.attendances.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      checkIn: a.checkIn?.toISOString() ?? null,
      checkOut: a.checkOut?.toISOString() ?? null,
      hoursWorked: a.hoursWorked ? toNum(a.hoursWorked) : null,
      projectName: a.project?.name ?? null,
    })),
    attendanceStats: { presentDays, halfDays, lateDays, absentDays, total: employee.attendances.length },
    payrollHistory,
    payrollStats: { totalNetPaid, count: payrollHistory.length },
    tasks,
    dprHistory,
    dprStats: { totalHours: totalDprHours, count: dprHistory.length },
    leaveHistory,
    leaveStats: {
      pending: leaveHistory.filter((l) => l.status === "PENDING").length,
      approved: leaveHistory.filter((l) => l.status === "APPROVED").length,
      total: leaveHistory.length,
    },
    reportsTo,
    directReports,
    reportsToMembershipId,
  };

  return (
    <PageContextProvider value={{
      entityType: "employee",
      status: employee.contractStatus ?? undefined,
      label: employee.name,
      subtitle: employee.trade ?? employee.designation ?? undefined,
      recordId: employee.id,
    }}>
    <>
      <MobileEmployeeDetailClient
        employee={data}
        canManage={canManage}
        actorRole={role}
        projects={projects}
        stockLocations={stockLocations}
        potentialManagers={potentialManagers}
      />
    </>
    </PageContextProvider>
  );
}

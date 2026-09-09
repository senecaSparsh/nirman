import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { EmployeeProfileClient, type EmployeeProfileData } from "@/components/hr/employee-profile-client";

export const metadata = { title: "Employee Profile · Nirman" };

export default function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading employee profile…" />}>
      <EmployeeProfileContent params={params} />
    </Suspense>
  );
}

async function EmployeeProfileContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return <NoAccess what="employee profile" />;
  }

  const canManage = hasPermission(role, PERM.HR_MANAGE);
  const canManagePayroll = hasPermission(role, PERM.PAYROLL_MANAGE);
  const canAssignTasks = hasPermission(role, PERM.TASKS_ASSIGN);
  const { id } = await params;

  // Hierarchical RBAC: a PROJECT-scoped user only sees employees on their sites.
  const scope = await getUserScope();
  const employeeProjectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { activeProjectId: { in: scope.projectIds } }
      : {};

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...employeeProjectFilter },
    include: {
      crew: { select: { id: true, name: true, projectId: true, project: { select: { id: true, name: true } } } },
      activeProject: { select: { id: true, name: true } },
      reportingLocation: { select: { id: true, name: true } },
      user: {
        select: {
          id: true, name: true, email: true, role: true, phone: true,
          employeeCode: true, designation: true, department: true,
          joiningDate: true, employmentEndDate: true, active: true,
          image: true, lastLoginAt: true,
        },
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
        take: 90,
        include: { project: { select: { id: true, name: true } } },
      },
      payrollLines: {
        orderBy: { payrollPeriod: { year: "desc" } },
        take: 24,
        include: {
          payrollPeriod: {
            select: {
              id: true, month: true, year: true, status: true,
              startDate: true, endDate: true, paidAt: true,
            },
          },
        },
      },
      dprLaborLines: {
        orderBy: { dpr: { date: "desc" } },
        take: 50,
        include: {
          dpr: {
            select: {
              id: true, date: true, projectId: true, approvalStatus: true,
              workType: true, project: { select: { id: true, name: true } },
            },
          },
        },
      },
      leaveRequests: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { approvedBy: { select: { id: true, name: true } } },
      },
      benefits: {
        orderBy: { createdAt: "desc" },
      },
      salaryComponents: { where: { active: true }, select: { id: true } },
    },
  });

  // ── Fetch document attachments for this employee ──
  const attachments = await prisma.entityAttachment.findMany({
    where: { companyId: company.id, entityType: "Employee", entityId: id },
    include: {
      upload: { select: { id: true, url: true, originalName: true, mimeType: true, size: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!employee) {
    return <NoAccess what="employee" />;
  }

  // ── Lazy contract expiry check ──
  // If the employee has a contractEndDate that has passed and the contract
  // is still ISSUED or CONFIRMED, auto-mark it as EXPIRED. This is a cheap
  // check that runs on every profile view, keeping contract status current
  // without needing a cron job.
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
  // The reporting line lives on UserCompany, not Employee. Fetch it for
  // display when the employee has a linked User account.
  let reportsTo: { membershipId: string; userId: string; name: string; role: string } | null = null;
  let directReports: { membershipId: string; userId: string; name: string; role: string }[] = [];
  let reportsToMembershipId: string | null = null;
  if (employee.userId) {
    const membership = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: employee.userId, companyId: company.id } },
      include: {
        reportsTo: { include: { user: { select: { id: true, name: true } } } },
        directReports: { include: { user: { select: { id: true, name: true } } } },
      },
    });
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
  }

  // Tasks are assigned to the linked User, not the Employee record directly.
  let tasks: Array<{
    id: string; title: string; status: string; priority: string;
    dueDate: string | null; completedAt: string | null; createdAt: string;
    assignedByName: string | null;
  }> = [];
  if (employee.userId) {
    const taskRows = await prisma.task.findMany({
      where: { assignedToId: employee.userId },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: { assignedBy: { select: { name: true } } },
    });
    tasks = taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      assignedByName: t.assignedBy?.name ?? null,
    }));
  }

  // ── Attendance stats (last 30 records) ──
  const recent30 = employee.attendances.slice(0, 30);
  const presentDays = recent30.filter((a) => a.status === "PRESENT" || a.status === "OVERTIME").length;
  const halfDays = recent30.filter((a) => a.status === "HALF_DAY").length;
  const lateDays = recent30.filter((a) => a.status === "LATE").length;
  const absentDays = recent30.filter((a) => a.status === "ABSENT").length;
  const leaveDays = recent30.filter((a) => a.status === "LEAVE" || a.status === "PAID_LEAVE" || a.status === "NON_PAID_LEAVE").length;

  // ── Payroll stats ──
  const payrollHistory = employee.payrollLines.map((l) => ({
    id: l.id,
    periodId: l.payrollPeriod.id,
    month: l.payrollPeriod.month,
    year: l.payrollPeriod.year,
    status: l.payrollPeriod.status,
    daysWorked: toNum(l.daysWorked),
    basicAmount: toNum(l.basicAmount),
    overtimeAmount: toNum(l.overtimeAmount),
    allowance: toNum(l.allowance),
    bonus: toNum(l.bonus),
    pf: toNum(l.pf),
    esi: toNum(l.esi),
    professionTax: toNum(l.professionTax),
    tax: toNum(l.tax),
    deductions: toNum(l.deductions),
    grossPay: toNum(l.grossPay),
    totalDeductions: toNum(l.totalDeductions),
    netPay: toNum(l.netPay),
    paidAt: l.payrollPeriod.paidAt?.toISOString() ?? null,
  }));
  const totalNetPaid = payrollHistory.filter((p) => p.status === "PAID").reduce((s, p) => s + p.netPay, 0);
  const avgNet = payrollHistory.length > 0 ? payrollHistory.reduce((s, p) => s + p.netPay, 0) / payrollHistory.length : 0;
  const lastPayroll = payrollHistory[0] ?? null;

  // ── Leave stats ──
  const leaveHistory = employee.leaveRequests.map((l) => ({
    id: l.id,
    type: l.type,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    days: toNum(l.days),
    reason: l.reason,
    status: l.status,
    approvedByName: l.approvedBy?.name ?? null,
    approvedAt: l.approvedAt?.toISOString() ?? null,
    rejectedReason: l.rejectedReason,
    createdAt: l.createdAt.toISOString(),
  }));
  const pendingLeaves = leaveHistory.filter((l) => l.status === "PENDING").length;
  const approvedLeaves = leaveHistory.filter((l) => l.status === "APPROVED").length;

  // ── DPR labor stats ──
  const dprHistory = employee.dprLaborLines.map((d) => ({
    id: d.id,
    dprId: d.dpr.id,
    date: d.dpr.date.toISOString(),
    projectName: d.dpr.project?.name ?? null,
    workType: d.dpr.workType,
    approvalStatus: d.dpr.approvalStatus,
    hoursWorked: toNum(d.hoursWorked),
    taskDescription: d.taskDescription,
  }));
  const totalDprHours = dprHistory.reduce((s, d) => s + d.hoursWorked, 0);

  const data: EmployeeProfileData = {
    id: employee.id,
    name: employee.name,
    trade: employee.trade,
    designation: employee.designation,
    phone: employee.phone,
    email: employee.email,
    wageType: employee.wageType,
    dailyRate: toNum(employee.dailyRate),
    monthlySalary: employee.monthlySalary ? toNum(employee.monthlySalary) : null,
    joinDate: employee.joinDate ? employee.joinDate.toISOString() : null,
    hierarchyLevel: employee.hierarchyLevel,
    active: employee.active,
    // ── Dossier fields ──
    employmentType: employee.employmentType,
    probationEndDate: employee.probationEndDate?.toISOString() ?? null,
    confirmationDate: employee.confirmationDate?.toISOString() ?? null,
    noticePeriodDays: employee.noticePeriodDays,
    contractStartDate: employee.contractStartDate?.toISOString() ?? null,
    contractEndDate: employee.contractEndDate?.toISOString() ?? null,
    // ── Contract / agreement tracking ──
    contractStatus: employee.contractStatus,
    contractIssuedAt: employee.contractIssuedAt?.toISOString() ?? null,
    contractConfirmedAt: employee.contractConfirmedAt?.toISOString() ?? null,
    // ── Offer / appointment / ID card tracking ──
    offerLetterStatus: employee.offerLetterStatus,
    offerLetterIssuedAt: employee.offerLetterIssuedAt?.toISOString() ?? null,
    appointmentLetterStatus: employee.appointmentLetterStatus,
    appointmentLetterIssuedAt: employee.appointmentLetterIssuedAt?.toISOString() ?? null,
    idCardStatus: employee.idCardStatus,
    idCardIssuedAt: employee.idCardIssuedAt?.toISOString() ?? null,
    // ── Onboarding checklist ──
    documentsSubmitted: employee.documentsSubmitted,
    backgroundVerified: employee.backgroundVerified,
    onboardingComplete: employee.onboardingComplete,
    // ── Salary structure (for onboarding step) ──
    hasSalaryComponents: employee.salaryComponents.length > 0,
    // ── Auto-deposit ──
    autoDepositEnabled: employee.autoDepositEnabled,
    autoDepositSetupAt: employee.autoDepositSetupAt?.toISOString() ?? null,
    payDay: employee.payDay,
    bankAccountHolder: employee.bankAccountHolder,
    bankAccountNumber: employee.bankAccountNumber,
    bankIfsc: employee.bankIfsc,
    bankName: employee.bankName,
    bankBranch: employee.bankBranch,
    panNumber: employee.panNumber,
    aadhaarNumber: employee.aadhaarNumber,
    pfNumber: employee.pfNumber,
    esiNumber: employee.esiNumber,
    uan: employee.uan,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    emergencyContactRelation: employee.emergencyContactRelation,
    permanentAddress: employee.permanentAddress,
    currentAddress: employee.currentAddress,
    crewId: employee.crewId,
    crewName: employee.crew?.name ?? null,
    crewProjectName: employee.crew?.project?.name ?? null,
    activeProjectId: employee.activeProjectId,
    activeProjectName: employee.activeProject?.name ?? null,
    reportingLocationId: employee.reportingLocationId,
    reportingLocationName: employee.reportingLocation?.name ?? null,
    userId: employee.userId,
    user: employee.user
      ? {
          id: employee.user.id,
          name: employee.user.name,
          email: employee.user.email,
          role: employee.user.role,
          phone: employee.user.phone,
          employeeCode: employee.user.employeeCode,
          designation: employee.user.designation,
          department: employee.user.department,
          joiningDate: employee.user.joiningDate ? employee.user.joiningDate.toISOString() : null,
          employmentEndDate: employee.user.employmentEndDate ? employee.user.employmentEndDate.toISOString() : null,
          active: employee.user.active,
          image: employee.user.image,
          lastLoginAt: employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
        }
      : null,
    supervisedCrews: employee.supervisedCrews.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      projectName: c.project?.name ?? null,
      memberCount: c._count.members,
    })),
    attendance: {
      records: employee.attendances.map((a) => ({
        id: a.id,
        date: a.date.toISOString(),
        status: a.status,
        checkIn: a.checkIn?.toISOString() ?? null,
        checkOut: a.checkOut?.toISOString() ?? null,
        hoursWorked: a.hoursWorked ? toNum(a.hoursWorked) : null,
        projectName: a.project?.name ?? null,
        notes: a.notes,
      })),
      presentDays,
      halfDays,
      lateDays,
      absentDays,
      leaveDays,
      totalRecords: employee.attendances.length,
    },
    payroll: {
      history: payrollHistory,
      totalNetPaid,
      avgNet,
      lastNet: lastPayroll?.netPay ?? null,
      lastPeriod: lastPayroll ? `${lastPayroll.month}/${lastPayroll.year}` : null,
    },
    tasks,
    dprs: {
      history: dprHistory,
      totalHours: totalDprHours,
    },
    leaves: {
      history: leaveHistory,
      pending: pendingLeaves,
      approved: approvedLeaves,
      total: leaveHistory.length,
    },
    // ── Benefits ──
    benefits: employee.benefits.map((b) => ({
      id: b.id,
      type: b.type,
      amount: b.amount ? toNum(b.amount) : null,
      frequency: b.frequency,
      startDate: b.startDate?.toISOString() ?? null,
      endDate: b.endDate?.toISOString() ?? null,
      notes: b.notes,
      active: b.active,
    })),
    // ── Document attachments ──
    attachments: attachments.map((a) => ({
      id: a.id,
      category: a.category,
      label: a.label,
      createdAt: a.createdAt.toISOString(),
      upload: {
        id: a.upload.id,
        url: a.upload.url,
        originalName: a.upload.originalName,
        mimeType: a.upload.mimeType,
        size: a.upload.size,
      },
    })),
    // ── Reporting line ──
    reportsTo,
    directReports,
    reportsToMembershipId,
  };

  return (
    <EmployeeProfileClient
      employee={data}
      actorRole={role}
      permissions={{
        canManage,
        canManagePayroll,
        canAssignTasks,
      }}
    />
  );
}

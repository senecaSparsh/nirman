import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, getCurrentUser, getEmployeeAccessScope, canManageSpecificEmployee, getCompanyGroupIds } from "@/lib/server";
import { PERM, hasPermission, ROLES, type Role } from "@/lib/roles";
import { MobileEmployeeDetailClient } from "./MobileEmployeeDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import type { OnboardingEmployeeData } from "./MobileOnboardingTab";

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
  // Gate: require HR_VIEW to access employee details
  if (!hasPermission(role, PERM.HR_VIEW)) {
    redirect("/m");
  }
  // Root-level access scope: department filter + field-level gating
  const accessScope = await getEmployeeAccessScope();
  const currentUser = await getCurrentUser();
  const { id } = await params;

  const [employee, projects, stockLocations, attachments, customRoles, departments] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null, ...accessScope.employeeFilter },
      include: {
        crew: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        activeProject: { select: { id: true, name: true } },
        reportingLocation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        // On-site reporting line (Employee → Employee, no login required)
        reportsTo: { select: { id: true, name: true, designation: true, trade: true, userId: true, user: { select: { role: true } } } },
        directReports: { select: { id: true, name: true, designation: true, trade: true, userId: true, user: { select: { role: true } } } },
        user: {
          select: {
            id: true, name: true, email: true, role: true, phone: true, image: true,
            employeeCode: true, designation: true, department: true,
            joiningDate: true, employmentEndDate: true, active: true, lastLoginAt: true,
            phoneVerified: true, phoneVerifiedAt: true, phoneSyncedAt: true,
          },
        },
        // Sensitive fields: only include if viewer has payroll/hr permission
        ...(accessScope.canSeePayroll ? {
          salaryComponents: {
            where: { active: true },
            orderBy: [{ isDeduction: "asc" }, { type: "asc" }],
          },
          benefits: {
            where: { active: true },
            orderBy: { type: "asc" },
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
              proofUpload: { select: { id: true, url: true } },
            },
          },
        } : {}),
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
    prisma.entityAttachment.findMany({
      where: { companyId: company.id, entityType: "Employee", entityId: id },
      include: {
        upload: { select: { id: true, url: true, originalName: true, mimeType: true, size: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customRole.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.department.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, code: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!employee) {
    return (
      <>
        <MobileEmployeeDetailClient notFound canManage={accessScope.canManageEmployee} actorRole={role} projects={projects} stockLocations={stockLocations} potentialManagers={[]} />
      </>
    );
  }

  // ── Hierarchy check: can the viewer edit THIS employee? ──
  // Combines access scope (HR_MANAGE) with a tier comparison: the viewer
  // must be at a higher tier (lower number) than the employee's linked user.
  // Self-edit is blocked (use settings). Field workers without logins can
  // be managed by anyone with HR_MANAGE.
  const canEditEmployee = await canManageSpecificEmployee(
    { userId: employee.userId, user: employee.user ? { role: employee.user.role } : null, hierarchyLevel: employee.hierarchyLevel },
    currentUser?.id ?? "",
  );

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

  // ── Reporting line (Employee.reportsToEmployeeId — on-site hierarchy) ──
  // This is the real-world reporting chain: who this employee reports to
  // and who reports to them. Works for all employees, including those
  // without login accounts (unlike the old UserCompany.reportsTo).
  const reportsTo = employee.reportsTo
    ? {
        employeeId: employee.reportsTo.id,
        name: employee.reportsTo.name,
        designation: employee.reportsTo.designation ?? employee.reportsTo.trade ?? null,
        role: employee.reportsTo.user?.role ?? null,
      }
    : null;

  const directReports = employee.directReports.map((r) => ({
    employeeId: r.id,
    name: r.name,
    designation: r.designation ?? r.trade ?? null,
    role: r.user?.role ?? null,
  }));

  // Potential managers = other active employees in the company, EXCLUDING
  // anyone who is below this employee in the hierarchy (subordinates and
  // their subordinates, recursively). Setting a subordinate as your manager
  // would create a cycle, so we filter them out here.
  // We walk down the tree from this employee to collect all descendant IDs.
  const descendantIds = new Set<string>();
  let frontier = employee.directReports.map((r) => r.id);
  while (frontier.length > 0) {
    for (const id of frontier) descendantIds.add(id);
    const next = await prisma.employee.findMany({
      where: { id: { in: frontier }, deletedAt: null },
      select: { id: true, directReports: { select: { id: true } } },
    });
    frontier = [];
    for (const emp of next) {
      for (const dr of emp.directReports) {
        if (!descendantIds.has(dr.id)) frontier.push(dr.id);
      }
    }
  }

  const potentialManagers = await prisma.employee.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      active: true,
      id: { notIn: [employee.id, ...Array.from(descendantIds)] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, designation: true, trade: true },
    take: 200,
  });

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

  // payrollLines is only included when canSeePayroll is true; cast for type safety
  const payrollLines = (employee as { payrollLines?: Array<Record<string, unknown>> }).payrollLines ?? [];
  const payrollHistory = payrollLines.map((l) => ({
    id: l.id as string,
    periodId: (l as { payrollPeriodId?: string }).payrollPeriodId ?? "",
    month: (l.payrollPeriod as { month: number }).month,
    year: (l.payrollPeriod as { year: number }).year,
    status: (l.payrollPeriod as { status: string }).status,
    daysWorked: toNum(l.daysWorked as { toNumber: () => number }),
    grossPay: toNum(l.grossPay as { toNumber: () => number }),
    totalDeductions: toNum(l.totalDeductions as { toNumber: () => number }),
    netPay: toNum(l.netPay as { toNumber: () => number }),
    paidAt: (l.payrollPeriod as { paidAt: Date | null }).paidAt?.toISOString() ?? null,
    paymentReference: l.paymentReference as string | null,
    paymentMode: l.paymentMode as string | null,
    paymentDate: (l.paymentDate as Date | null)?.toISOString() ?? null,
    proofUploadId: l.proofUploadId as string | null,
    proofUrl: (l.proofUpload as { url: string } | undefined)?.url ?? null,
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

  // ── Compute available companies for multi-company add ──
  let availableCompanies: { id: string; name: string; parentCompanyId: string | null }[] = [];
  if (canEditEmployee && employee.userId) {
    const groupIds = await getCompanyGroupIds();
    const existingCompanyIds = new Set([
      company.id,
      ...((await prisma.employee.findMany({
        where: { userId: employee.userId, deletedAt: null },
        select: { companyId: true },
      })).map((e) => e.companyId)),
    ]);
    const available = groupIds.filter((id) => !existingCompanyIds.has(id));
    if (available.length > 0) {
      availableCompanies = await prisma.company.findMany({
        where: { id: { in: available }, deletedAt: null },
        select: { id: true, name: true, parentCompanyId: true },
        orderBy: { name: "asc" },
      });
    }
  }

  const data = {
    id: employee.id,
    name: employee.name,
    trade: employee.trade,
    designation: employee.designation,
    departmentId: employee.departmentId,
    departmentName: employee.department?.name ?? null,
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
    contractTerms: employee.contractTerms,
    contractToken: employee.contractToken,
    offerLetterStatus: employee.offerLetterStatus,
    offerLetterIssuedAt: employee.offerLetterIssuedAt ? employee.offerLetterIssuedAt.toISOString() : null,
    offerLetterTerms: employee.offerLetterTerms,
    offerLetterAcceptedAt: employee.offerLetterAcceptedAt ? employee.offerLetterAcceptedAt.toISOString() : null,
    offerToken: employee.offerToken,
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
    autoDepositSetupAt: employee.autoDepositSetupAt ? employee.autoDepositSetupAt.toISOString() : null,
    payDay: employee.payDay,
    // Bank details — only sent if viewer has payroll/hr permission
    bankName: accessScope.canSeeBankDetails ? employee.bankName : null,
    bankAccountNumber: accessScope.canSeeBankDetails ? employee.bankAccountNumber : null,
    bankAccountHolder: accessScope.canSeeBankDetails ? employee.bankAccountHolder : null,
    bankIfsc: accessScope.canSeeBankDetails ? employee.bankIfsc : null,
    bankBranch: accessScope.canSeeBankDetails ? employee.bankBranch : null,
    employmentType: employee.employmentType,
    noticePeriodDays: employee.noticePeriodDays,
    contractStartDate: employee.contractStartDate ? employee.contractStartDate.toISOString() : null,
    contractEndDate: employee.contractEndDate ? employee.contractEndDate.toISOString() : null,
    // Salary components — only sent if viewer has payroll/hr permission
    salaryComponents: (employee.salaryComponents ?? []).map((c) => ({
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
    benefits: (employee.benefits ?? []).map((b) => ({
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
          id: employee.user.id,
          email: employee.user.email,
          // Role + access info — only sent if viewer has users/hr permission
          role: accessScope.canSeeAccessInfo ? employee.user.role : null,
          phone: employee.user.phone,
          image: employee.user.image,
          employeeCode: employee.user.employeeCode,
          department: employee.user.department,
          joiningDate: employee.user.joiningDate ? employee.user.joiningDate.toISOString() : null,
          active: employee.user.active,
          lastLoginAt: accessScope.canSeeAccessInfo && employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
          phoneVerified: accessScope.canSeeAccessInfo ? employee.user.phoneVerified : null,
          phoneVerifiedAt: accessScope.canSeeAccessInfo && employee.user.phoneVerifiedAt ? employee.user.phoneVerifiedAt.toISOString() : null,
          phoneSyncedAt: accessScope.canSeeAccessInfo && employee.user.phoneSyncedAt ? employee.user.phoneSyncedAt.toISOString() : null,
        }
      : null,
    supervisedCrews: employee.supervisedCrews.map((c) => ({
      id: c.id, name: c.name, active: c.active,
      projectName: c.project?.name ?? null, memberCount: c._count.members,
    })),
    // Multi-company: other Employee records for the same person
    companyMemberships: employee.userId
      ? (await prisma.employee.findMany({
          where: { userId: employee.userId, deletedAt: null, id: { not: employee.id } },
          select: { id: true, companyId: true, active: true, company: { select: { name: true } } },
        })).map((e) => ({ employeeId: e.id, companyId: e.companyId, companyName: e.company.name, active: e.active }))
      : [],
    availableCompanies,
    resources: (await prisma.employeeResource.findMany({
      where: { employeeId: employee.id, companyId: company.id },
      orderBy: [{ returnedAt: "desc" }, { issuedAt: "desc" }],
      include: {
        issuedByUser: { select: { id: true, name: true } },
        returnedToUser: { select: { id: true, name: true } },
      },
    })).map((r) => ({
      id: r.id, name: r.name, category: r.category, assetTag: r.assetTag, serialNumber: r.serialNumber,
      quantity: r.quantity, issuedAt: r.issuedAt.toISOString(),
      expectedReturnAt: r.expectedReturnAt?.toISOString() ?? null,
      returnedAt: r.returnedAt?.toISOString() ?? null,
      conditionAtIssue: r.conditionAtIssue, conditionAtReturn: r.conditionAtReturn,
      depositAmount: r.depositAmount ? Number(r.depositAmount) : null,
      depositRefunded: r.depositRefunded,
      issuedByUser: r.issuedByUser, returnedToUser: r.returnedToUser, notes: r.notes,
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
    reportsToEmployeeId: employee.reportsToEmployeeId,
  };

  // ── Build OnboardingEmployeeData for the inline onboarding modal ──
  const onboardingData: OnboardingEmployeeData = {
    id: employee.id,
    name: employee.name,
    trade: employee.trade,
    designation: employee.designation,
    departmentId: employee.departmentId,
    departmentName: employee.department?.name ?? null,
    phone: employee.phone,
    email: employee.email,
    wageType: employee.wageType as "DAILY" | "MONTHLY" | "FIXED",
    dailyRate: employee.dailyRate != null ? toNum(employee.dailyRate) : null,
    monthlySalary: employee.monthlySalary != null ? toNum(employee.monthlySalary) : null,
    joinDate: employee.joinDate ? employee.joinDate.toISOString() : null,
    hierarchyLevel: employee.hierarchyLevel,
    active: employee.active,
    activeProjectId: employee.activeProjectId,
    activeProjectName: employee.activeProject?.name ?? null,
    reportingLocationId: employee.reportingLocationId,
    reportingLocationName: employee.reportingLocation?.name ?? null,
    crewName: employee.crew?.name ?? null,
    crewProjectName: employee.crew?.project?.name ?? null,
    userId: employee.userId,
    contractStatus: employee.contractStatus,
    contractIssuedAt: employee.contractIssuedAt ? employee.contractIssuedAt.toISOString() : null,
    contractConfirmedAt: employee.contractConfirmedAt ? employee.contractConfirmedAt.toISOString() : null,
    contractTerms: employee.contractTerms,
    contractToken: employee.contractToken,
    offerLetterStatus: employee.offerLetterStatus,
    offerLetterIssuedAt: employee.offerLetterIssuedAt ? employee.offerLetterIssuedAt.toISOString() : null,
    offerLetterTerms: employee.offerLetterTerms,
    offerLetterAcceptedAt: employee.offerLetterAcceptedAt ? employee.offerLetterAcceptedAt.toISOString() : null,
    offerToken: employee.offerToken,
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
    employmentType: employee.employmentType,
    probationEndDate: employee.probationEndDate ? employee.probationEndDate.toISOString() : null,
    confirmationDate: employee.confirmationDate ? employee.confirmationDate.toISOString() : null,
    noticePeriodDays: employee.noticePeriodDays,
    contractStartDate: employee.contractStartDate ? employee.contractStartDate.toISOString() : null,
    contractEndDate: employee.contractEndDate ? employee.contractEndDate.toISOString() : null,
    autoDepositEnabled: employee.autoDepositEnabled,
    autoDepositSetupAt: employee.autoDepositSetupAt ? employee.autoDepositSetupAt.toISOString() : null,
    payDay: employee.payDay,
    // Sensitive bank + personal docs — only sent if viewer has payroll/hr permission
    bankAccountHolder: accessScope.canSeeBankDetails ? employee.bankAccountHolder : null,
    bankAccountNumber: accessScope.canSeeBankDetails ? employee.bankAccountNumber : null,
    bankIfsc: accessScope.canSeeBankDetails ? employee.bankIfsc : null,
    bankName: accessScope.canSeeBankDetails ? employee.bankName : null,
    bankBranch: accessScope.canSeeBankDetails ? employee.bankBranch : null,
    panNumber: accessScope.canSeePersonalDocs ? employee.panNumber : null,
    aadhaarNumber: accessScope.canSeePersonalDocs ? employee.aadhaarNumber : null,
    pfNumber: accessScope.canSeePersonalDocs ? employee.pfNumber : null,
    esiNumber: accessScope.canSeePersonalDocs ? employee.esiNumber : null,
    uan: accessScope.canSeePersonalDocs ? employee.uan : null,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    emergencyContactRelation: employee.emergencyContactRelation,
    permanentAddress: employee.permanentAddress,
    currentAddress: employee.currentAddress,
    salaryComponents: employee.salaryComponents.map((c) => ({
      id: c.id, type: c.type, amount: toNum(c.amount), frequency: c.frequency,
      isDeduction: c.isDeduction, isPercentage: c.isPercentage,
      percentageOfBasic: c.percentageOfBasic ? toNum(c.percentageOfBasic) : null,
      notes: c.notes, active: c.active,
    })),
    benefits: employee.benefits.map((b) => ({
      id: b.id, type: b.type, amount: b.amount ? toNum(b.amount) : null, frequency: b.frequency,
      startDate: b.startDate ? b.startDate.toISOString() : null,
      endDate: b.endDate ? b.endDate.toISOString() : null,
      notes: b.notes, active: b.active,
    })),
    attachments: attachments.map((a) => ({
      id: a.id, category: a.category, label: a.label, createdAt: a.createdAt.toISOString(),
      upload: {
        id: a.upload.id, url: a.upload.url, originalName: a.upload.originalName,
        mimeType: a.upload.mimeType, size: a.upload.size,
      },
    })),
    user: employee.user
      ? {
          id: employee.user.id,
          email: employee.user.email, role: employee.user.role, phone: employee.user.phone,
          image: employee.user.image, employeeCode: employee.user.employeeCode,
          department: employee.user.department,
          joiningDate: employee.user.joiningDate ? employee.user.joiningDate.toISOString() : null,
          active: employee.user.active,
          lastLoginAt: employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
          phoneVerified: employee.user.phoneVerified,
          phoneVerifiedAt: employee.user.phoneVerifiedAt ? employee.user.phoneVerifiedAt.toISOString() : null,
          phoneSyncedAt: employee.user.phoneSyncedAt ? employee.user.phoneSyncedAt.toISOString() : null,
        }
      : null,
    // Multi-company: other Employee records for the same person
    companyMemberships: employee.userId
      ? (await prisma.employee.findMany({
          where: { userId: employee.userId, deletedAt: null, id: { not: employee.id } },
          select: { id: true, companyId: true, active: true, company: { select: { name: true } } },
        })).map((e) => ({ employeeId: e.id, companyId: e.companyId, companyName: e.company.name, active: e.active }))
      : [],
  };

  // Build assignable roles list (built-in + custom) for access management
  const assignableRoles = [
    ...(Object.keys(ROLES) as Role[])
      .filter((r) => r !== "OWNER" && r !== "DEVELOPER")
      .map((r) => ({ key: r, label: ROLES[r].label })),
    ...customRoles.map((cr) => ({
      key: `CUSTOM_${cr.key}` as string,
      label: cr.label,
    })),
  ];

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
        canManage={canEditEmployee}
        actorRole={role}
        projects={projects}
        stockLocations={stockLocations}
        potentialManagers={potentialManagers}
        onboardingData={onboardingData}
        canManagePayroll={accessScope.canManagePayroll && canEditEmployee}
        canManageUsers={accessScope.canManageAccess && canEditEmployee}
        assignableRoles={assignableRoles}
        departments={departments}
        currentUserId={currentUser?.id}
      />
    </>
    </PageContextProvider>
  );
}

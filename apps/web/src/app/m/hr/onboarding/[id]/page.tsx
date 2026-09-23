import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, getUserScope, getUserPermissions, getEmployeeAccessScope, getCurrentUser, canManageSpecificEmployee, employeeVisibilityWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileOnboardingPageClient } from "./MobileOnboardingPageClient";

/**
 * /m/hr/onboarding/[id] — the full onboarding workflow for a single employee.
 * Profile → Account → Agreement → Deposit → Dossier → Offboard, grouped
 * behind a RegisterTabs toggle (same look as the stock hub).
 */
export default function MobileOnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={4} />}>
      <MobileOnboardingDetailContent params={params} />
    </Suspense>
  );
}

async function MobileOnboardingDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const __effPerms = await getUserPermissions();

  if (!__effPerms.includes(PERM.HR_VIEW)) {
    return (
      <div className="p-4 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const canManage = __effPerms.includes(PERM.HR_MANAGE);
  const canManagePayroll = __effPerms.includes(PERM.PAYROLL_MANAGE);
  const __empScope = await getEmployeeAccessScope();
  const canManageAccess = __effPerms.includes(PERM.USERS_MANAGE);
  // Field-visibility policy (matches getEmployeeAccessScope +
  // lib/employee-visibility.ts tier groups):
  //   canSeeComp  — wages, employment terms, salary components, benefits
  //                 (payroll.view|payroll.manage|hr.manage)
  //   canSeeBank  — bank account fields (payroll.manage|hr.manage)
  //   canSeeDocs  — gov IDs, addresses, DOB, attachments (payroll.manage|hr.manage)
  //   tokens      — contractToken/offerToken are bearer credentials; only the
  //                 docs tier may ever serialize them (payroll.view must NOT
  //                 get them — a leaked token signs documents as the employee).
  // Account-status metadata needs users.manage or hr.manage.
  // hr.view-only viewers get the roster + onboarding checklist state only.
  const canSeeComp = __empScope.canSeePayroll;
  const canSeeBank = __empScope.canSeeBankDetails;
  const canSeeDocs = __empScope.canSeePersonalDocs;
  // Signing links are bearer credentials — hr.manage only, never payroll.manage.
  const canSeeTokens = __empScope.canSeeSigningTokens;
  const canSeeAccess = canManage || canManageAccess;
  const { id } = await params;

  // Hierarchical RBAC: scoped users only see employees inside their scope —
  // PROJECT scope filters by activeProjectId, DEPARTMENT by departmentId,
  // and an empty assignment list sees nobody (["__none__"] fails closed).
  const scope = await getUserScope();
  const employeeProjectFilter =
    scope.scopeType === "PROJECT"
      ? { activeProjectId: { in: scope.projectIds.length > 0 ? scope.projectIds : ["__none__"] } }
      : scope.scopeType === "DEPARTMENT"
        ? { departmentId: { in: scope.departmentIds.length > 0 ? scope.departmentIds : ["__none__"] } }
        : {};

  const [employee, projects, stockLocations, departments, attachments] = await Promise.all([
    prisma.employee.findFirst({
      // H1 wall — a non-top viewer opening an H1 onboarding URL gets "not found".
      where: { id, companyId: company.id, deletedAt: null, ...await employeeVisibilityWhere(), ...employeeProjectFilter },
      include: {
        crew: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        activeProject: { select: { id: true, name: true } },
        reportingLocation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        user: {
          select: {
            id: true, name: true, email: true, role: true, phone: true, image: true,
            employeeCode: true, designation: true, department: true,
            joiningDate: true, active: true, lastLoginAt: true,
            phoneVerified: true, phoneVerifiedAt: true, phoneSyncedAt: true,
          },
        },
        benefits: { orderBy: { createdAt: "desc" } },
        salaryComponents: { where: { active: true }, orderBy: [{ isDeduction: "asc" }, { type: "asc" }] },
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
    prisma.department.findMany({
      where: { companyId: company.id, active: true },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.entityAttachment.findMany({
      where: { companyId: company.id, entityType: "Employee", entityId: id },
      include: {
        upload: { select: { id: true, url: true, originalName: true, mimeType: true, size: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!employee) {
    return (
      <div className="px-4 pt-10 text-center">
        <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-500)" }}>
          Employee not found
        </p>
        <Link
          href="/m/hr/onboarding"
          className="inline-block mt-3 text-m-caption font-semibold"
          style={{ color: "var(--color-signal-dark)" }}
        >
          ← Back to onboarding queue
        </Link>
      </div>
    );
  }

  // ── Lazy contract expiry check ──
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

  // ── Hierarchy check for access actions (set password etc.) — same gate as
  // the employee detail page: users.manage AND above this employee's tier,
  // self excluded. ──
  const currentUser = await getCurrentUser();
  const canEditEmployee = await canManageSpecificEmployee(
    { userId: employee.userId, user: employee.user ? { role: employee.user.role } : null, hierarchyLevel: employee.hierarchyLevel },
    currentUser?.id ?? "",
  );
  const effectiveCanManageAccess = canManageAccess && canEditEmployee;

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
    dailyRate: canSeeComp && employee.dailyRate != null ? toNum(employee.dailyRate) : null,
    monthlySalary: canSeeComp && employee.monthlySalary != null ? toNum(employee.monthlySalary) : null,
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
    contractTerms: canSeeComp ? employee.contractTerms : null,
    contractToken: canSeeTokens ? employee.contractToken : null,
    offerLetterStatus: employee.offerLetterStatus,
    offerLetterIssuedAt: employee.offerLetterIssuedAt ? employee.offerLetterIssuedAt.toISOString() : null,
    offerLetterTerms: canSeeComp ? employee.offerLetterTerms : null,
    offerLetterAcceptedAt: employee.offerLetterAcceptedAt ? employee.offerLetterAcceptedAt.toISOString() : null,
    offerToken: canSeeTokens ? employee.offerToken : null,
    idCardStatus: employee.idCardStatus,
    idCardIssuedAt: employee.idCardIssuedAt ? employee.idCardIssuedAt.toISOString() : null,
    appointmentLetterStatus: employee.appointmentLetterStatus,
    appointmentLetterIssuedAt: employee.appointmentLetterIssuedAt ? employee.appointmentLetterIssuedAt.toISOString() : null,
    documentsSubmitted: employee.documentsSubmitted,
    backgroundVerified: employee.backgroundVerified,
    onboardingComplete: employee.onboardingComplete,
    dateOfBirth: canSeeDocs && employee.dateOfBirth ? employee.dateOfBirth.toISOString() : null,
    bloodGroup: employee.bloodGroup,
    photoUrl: employee.photoUrl,
    employmentType: canSeeComp ? employee.employmentType : null,
    probationEndDate: canSeeComp && employee.probationEndDate ? employee.probationEndDate.toISOString() : null,
    confirmationDate: canSeeComp && employee.confirmationDate ? employee.confirmationDate.toISOString() : null,
    noticePeriodDays: canSeeComp ? employee.noticePeriodDays : null,
    contractStartDate: canSeeComp && employee.contractStartDate ? employee.contractStartDate.toISOString() : null,
    contractEndDate: canSeeComp && employee.contractEndDate ? employee.contractEndDate.toISOString() : null,
    autoDepositEnabled: canSeeComp ? employee.autoDepositEnabled : false,
    autoDepositSetupAt: canSeeComp && employee.autoDepositSetupAt ? employee.autoDepositSetupAt.toISOString() : null,
    payDay: canSeeComp ? employee.payDay : null,
    bankAccountHolder: canSeeBank ? employee.bankAccountHolder : null,
    bankAccountNumber: canSeeBank ? employee.bankAccountNumber : null,
    bankIfsc: canSeeBank ? employee.bankIfsc : null,
    bankName: canSeeBank ? employee.bankName : null,
    bankBranch: canSeeBank ? employee.bankBranch : null,
    panNumber: canSeeDocs ? employee.panNumber : null,
    aadhaarNumber: canSeeDocs ? employee.aadhaarNumber : null,
    pfNumber: canSeeDocs ? employee.pfNumber : null,
    esiNumber: canSeeDocs ? employee.esiNumber : null,
    uan: canSeeDocs ? employee.uan : null,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    emergencyContactRelation: employee.emergencyContactRelation,
    permanentAddress: canSeeDocs ? employee.permanentAddress : null,
    currentAddress: canSeeDocs ? employee.currentAddress : null,
    benefits: canSeeComp ? employee.benefits.map((b) => ({
      id: b.id,
      type: b.type,
      amount: b.amount ? toNum(b.amount) : null,
      frequency: b.frequency,
      startDate: b.startDate ? b.startDate.toISOString() : null,
      endDate: b.endDate ? b.endDate.toISOString() : null,
      notes: b.notes,
      active: b.active,
    })) : [],
    salaryComponents: canSeeComp ? employee.salaryComponents.map((c) => ({
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
      active: c.active,
    })) : [],
    // Attachments include uploaded KYC documents — dossier tier only
    // (same class as PAN/Aadhaar, not comp data).
    attachments: canSeeDocs ? attachments.map((a) => ({
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
    })) : [],
    user: employee.user
      ? {
          id: employee.user.id,
          email: employee.user.email,
          role: employee.user.role,
          phone: employee.user.phone,
          image: employee.user.image,
          employeeCode: employee.user.employeeCode,
          department: employee.user.department,
          joiningDate: employee.user.joiningDate ? employee.user.joiningDate.toISOString() : null,
          active: employee.user.active,
          // Account-status metadata — access-admin tier only.
          lastLoginAt: canSeeAccess && employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
          phoneVerified: canSeeAccess ? employee.user.phoneVerified : null,
          phoneVerifiedAt: canSeeAccess && employee.user.phoneVerifiedAt ? employee.user.phoneVerifiedAt.toISOString() : null,
          phoneSyncedAt: canSeeAccess && employee.user.phoneSyncedAt ? employee.user.phoneSyncedAt.toISOString() : null,
        }
      : null,
    // Cross-company memberships reveal group structure — manage tier.
    companyMemberships: canManage && employee.userId
      ? (await prisma.employee.findMany({
          where: { userId: employee.userId, deletedAt: null, id: { not: employee.id } },
          select: { id: true, companyId: true, active: true, company: { select: { name: true } } },
        })).map((e) => ({ employeeId: e.id, companyId: e.companyId, companyName: e.company.name, active: e.active }))
      : [],
  };

  return (
    <PageContextProvider value={{
      entityType: "onboarding",
      status: employee.contractStatus ?? undefined,
      label: employee.name,
      subtitle: employee.activeProject?.name ?? undefined,
      recordId: employee.id,
    }}>
    <MobileOnboardingPageClient
      employee={data}
      canManage={canManage}
      canManagePayroll={canManagePayroll}
      canManageAccess={effectiveCanManageAccess}
      actorRole={role}
      projects={projects}
      stockLocations={stockLocations}
      departments={departments}
      hqLabel={company.lat != null && company.lng != null ? `${company.name} — Head Office` : null}
    />
    </PageContextProvider>
  );
}

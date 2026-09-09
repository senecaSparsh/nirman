import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
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

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return (
      <div className="p-4 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const canManage = hasPermission(role, PERM.HR_MANAGE);
  const canManagePayroll = hasPermission(role, PERM.PAYROLL_MANAGE);
  const { id } = await params;

  // Hierarchical RBAC: a PROJECT-scoped user only sees employees on their sites.
  const scope = await getUserScope();
  const employeeProjectFilter =
    scope.scopeType === "PROJECT"
      ? { activeProjectId: { in: scope.projectIds.length > 0 ? scope.projectIds : ["__none__"] } }
      : {};

  const [employee, projects, stockLocations, departments, attachments] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null, ...employeeProjectFilter },
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
          lastLoginAt: employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
          phoneVerified: employee.user.phoneVerified,
          phoneVerifiedAt: employee.user.phoneVerifiedAt ? employee.user.phoneVerifiedAt.toISOString() : null,
          phoneSyncedAt: employee.user.phoneSyncedAt ? employee.user.phoneSyncedAt.toISOString() : null,
        }
      : null,
    companyMemberships: employee.userId
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
      actorRole={role}
      projects={projects}
      stockLocations={stockLocations}
      departments={departments}
    />
    </PageContextProvider>
  );
}

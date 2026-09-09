import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany } from "@/lib/server";
import { MePageClient, type MePageInitial } from "./MePageClient";

/**
 * /m/me — profile, settings, and rehomed header features.
 *
 * Server Component wrapper. Resolves the user's extended profile fields
 * + active company name + Employee record (onboarding progress, hierarchy,
 * reporting line) on the server so the client child renders with real data
 * on first paint — no /api/me + /api/company waterfall, no skeleton-then-swap
 * flash. Falls back to `null` when unauthenticated (the client auth guard
 * handles the redirect).
 */
export default async function MePage() {
  const initial = await resolveMePageInitial().catch(() => null);
  return <MePageClient initial={initial} />;
}

async function resolveMePageInitial(): Promise<MePageInitial | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const company = await getCompany();

  // Fetch the extended profile fields that /api/me also returns —
  // phone, image, employeeCode, etc. are not on the session object.
  const [dbUser, membership, employee] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        phone: true,
        image: true,
        active: true,
        employeeCode: true,
        designation: true,
        department: true,
        joiningDate: true,
        lastLoginAt: true,
      },
    }),
    // ── UserCompany membership — for the reporting line (reportsTo) ──
    prisma.userCompany.findFirst({
      where: { userId: user.id, companyId: company.id },
      select: {
        id: true,
        role: true,
        reportsToUserCompanyId: true,
        reportsTo: {
          select: {
            user: { select: { id: true, name: true, designation: true } },
          },
        },
      },
    }),
    // ── Employee record — for onboarding progress + hierarchy level ──
    prisma.employee.findFirst({
      where: { userId: user.id, companyId: company.id, deletedAt: null },
      select: {
        id: true,
        hierarchyLevel: true,
        trade: true,
        employmentType: true,
        documentsSubmitted: true,
        backgroundVerified: true,
        onboardingComplete: true,
        offerLetterStatus: true,
        contractStatus: true,
        appointmentLetterStatus: true,
        idCardStatus: true,
        autoDepositEnabled: true,
        salaryComponents: { where: { active: true }, select: { id: true } },
      },
    }),
  ]);

  // ── Resolve "reports to" name ──
  // Owner/Admin are at the top — they don't report to anyone. Only show
  // "Reports to" for non-owner/admin roles that have a reportsTo set.
  const role = membership?.role ?? user.role ?? "";
  const isTopLevel = role === "OWNER" || role === "ADMIN";
  const reportsToName = (!isTopLevel && membership?.reportsTo?.user?.name)
    ? membership.reportsTo.user.name
    : null;
  const reportsToDesignation = (!isTopLevel && membership?.reportsTo?.user?.designation)
    ? membership.reportsTo.user.designation
    : null;

  return {
    name: user.name,
    role,
    email: user.email,
    phone: dbUser?.phone ?? null,
    image: dbUser?.image ?? null,
    active: dbUser?.active ?? true,
    employeeCode: dbUser?.employeeCode ?? null,
    designation: dbUser?.designation ?? null,
    department: dbUser?.department ?? null,
    joiningDate: dbUser?.joiningDate?.toISOString() ?? null,
    lastLoginAt: dbUser?.lastLoginAt?.toISOString() ?? null,
    companyName: company.name,
    // ── Hierarchy + reporting line ──
    hierarchyLevel: employee?.hierarchyLevel ?? null,
    reportsToName,
    reportsToDesignation,
    // ── Onboarding progress (from Employee record) ──
    onboarding: employee
      ? {
          employeeId: employee.id,
          hasProfile: !!(user.name && (dbUser?.phone) && (dbUser?.designation || employee.trade)),
          hasEmploymentTerms: !!(
            employee.employmentType &&
            employee.employmentType !== "CONTRACT"
          ),
          hasSalaryStructure: employee.salaryComponents.length > 0,
          documentsSubmitted: employee.documentsSubmitted === true,
          backgroundVerified: employee.backgroundVerified === true,
          offerLetterIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.offerLetterStatus ?? ""),
          agreementIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? ""),
          agreementConfirmed: ["CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? ""),
          appointmentLetterIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.appointmentLetterStatus ?? ""),
          idCardIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.idCardStatus ?? ""),
          autoDepositEnabled: employee.autoDepositEnabled === true,
          isComplete: employee.onboardingComplete === true,
        }
      : null,
  };
}

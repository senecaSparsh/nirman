import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany } from "@/lib/server";
import { displayEmail } from "@/lib/utils";
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

  // ── Resolve custom role label from DB ──
  // For custom roles (CUSTOM_...), the label is stored in the CustomRole table,
  // not in the ROLES map. Without this, the client derives "Custom Site Lead"
  // from the key instead of showing the actual DB label "Site Lead".
  let roleLabel: string | null = null;
  if (role.startsWith("CUSTOM_")) {
    const customRole = await prisma.customRole.findFirst({
      where: { companyId: company.id, key: role },
      select: { label: true },
    }).catch(() => null);
    roleLabel = customRole?.label ?? null;
  }

  const reportsToName = (!isTopLevel && membership?.reportsTo?.user?.name)
    ? membership.reportsTo.user.name
    : null;
  const reportsToDesignation = (!isTopLevel && membership?.reportsTo?.user?.designation)
    ? membership.reportsTo.user.designation
    : null;

  // ── Worker self-service — payslip, leaves, attendance. Only fetched when
  // an Employee record exists (owners/admins without one skip the queries).
  let hr: MePageInitial["hr"] = null;
  if (employee) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [payslip, leaves, presentDays] = await Promise.all([
      // Latest PAID payslip — what the worker actually got last.
      prisma.payrollLine.findFirst({
        where: { employeeId: employee.id, payrollPeriod: { status: "PAID" } },
        orderBy: [{ payrollPeriod: { year: "desc" } }, { payrollPeriod: { month: "desc" } }],
        select: {
          daysWorked: true,
          grossPay: true,
          netPay: true,
          deductions: true,
          pf: true,
          esi: true,
          tax: true,
          payrollPeriod: { select: { month: true, year: true } },
          // Itemized breakdown (HRA, travel ₹3/km, PF…) — shown on the payslip
          components: {
            select: {
              label: true, calculationType: true, unitType: true, unitLabel: true,
              rate: true, quantity: true, amount: true, bucket: true, isDeduction: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }).then((l) => (l ? l : null)),
      // Recent leave requests — status is the "did the office respond" answer.
      prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, type: true, startDate: true, endDate: true, days: true, status: true },
      }),
      // Days present this calendar month.
      prisma.workerAttendance.count({
        where: {
          employeeId: employee.id,
          date: { gte: monthStart },
          status: { in: ["PRESENT", "HALF_DAY", "PAID_LEAVE", "OVERTIME", "LATE"] },
        },
      }),
    ]);
    hr = {
      payslip: payslip
        ? {
            month: payslip.payrollPeriod.month,
            year: payslip.payrollPeriod.year,
            daysWorked: Number(payslip.daysWorked),
            grossPay: Number(payslip.grossPay),
            netPay: Number(payslip.netPay),
            deductions:
              Number(payslip.deductions) +
              Number(payslip.pf) +
              Number(payslip.esi) +
              Number(payslip.tax),
            components: payslip.components.map((c) => ({
              label: c.label,
              calculationType: c.calculationType,
              unitType: c.unitType,
              unitLabel: c.unitLabel,
              rate: Number(c.rate),
              quantity: c.quantity != null ? Number(c.quantity) : null,
              amount: Number(c.amount),
              bucket: c.bucket,
              isDeduction: c.isDeduction,
            })),
          }
        : null,
      leaves: leaves.map((l) => ({
        id: l.id,
        type: l.type,
        startDate: l.startDate.toISOString().slice(0, 10),
        endDate: l.endDate.toISOString().slice(0, 10),
        days: Number(l.days),
        status: l.status,
      })),
      presentDaysThisMonth: presentDays,
    };
  }

  return {
    name: user.name,
    role,
    roleLabel,
    email: displayEmail(user.email) ?? "",
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
    hr,
  };
}

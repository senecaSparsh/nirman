/**
 * auto-complete-onboarding — automatically marks onboarding as complete
 * when all required steps are done. Called after any onboarding-related
 * update (document generation, agreement confirmation, auto-deposit setup,
 * etc.) so HR doesn't have to manually click "Complete Onboarding".
 *
 * The check is idempotent — if onboarding is already complete, it's a no-op.
 *
 * When onboarding completes, also auto-generates an employee code (EMP-0001)
 * on the linked User record if one doesn't exist yet.
 */
import { prisma } from "@nirman/db";
import { nextSequenceNumber } from "./sequence";

export async function autoCompleteOnboarding(employeeId: string, companyId: string): Promise<void> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: {
      id: true,
      onboardingComplete: true,
      name: true,
      phone: true,
      designation: true,
      trade: true,
      wageType: true,
      dailyRate: true,
      monthlySalary: true,
      employmentType: true,
      noticePeriodDays: true,
      contractStartDate: true,
      userId: true,
      documentsSubmitted: true,
      backgroundVerified: true,
      offerLetterStatus: true,
      contractStatus: true,
      appointmentLetterStatus: true,
      idCardStatus: true,
      autoDepositEnabled: true,
      salaryComponents: { where: { active: true }, select: { id: true } },
      user: { select: { id: true, employeeCode: true } },
    },
  });

  if (!employee) return;

  // ── Check all required steps ──
  // These MUST match buildOnboardingSteps in onboarding-steps.ts exactly.
  // If these drift, the UI will show steps as done but onboarding won't auto-complete
  // (or vice versa).
  const hasProfile = !!(employee.name && (employee.phone || employee.userId) && (employee.designation || employee.trade));
  const hasWage = employee.wageType === "DAILY"
    ? (employee.dailyRate ? Number(employee.dailyRate) > 0 : false)
    : (employee.monthlySalary ? Number(employee.monthlySalary) > 0 : false);
  const hasEmploymentTerms = !!(
    employee.employmentType &&
    employee.noticePeriodDays != null &&
    (employee.employmentType !== "CONTRACT" || employee.contractStartDate) &&
    (employee.employmentType !== "PROBATION" || employee.contractStartDate)
  );
  const hasSalaryStructure = employee.salaryComponents.length > 0;
  const hasAccount = !!employee.userId;
  const offerLetterIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.offerLetterStatus ?? "");
  const agreementConfirmed = ["CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");
  const appointmentLetterIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.appointmentLetterStatus ?? "");
  const idCardIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.idCardStatus ?? "");
  const hasAutoDeposit = employee.autoDepositEnabled === true;
  const documentsSubmitted = employee.documentsSubmitted === true;
  const backgroundVerified = employee.backgroundVerified === true;

  const allDone = [
    hasProfile,
    hasWage,
    hasEmploymentTerms,
    hasSalaryStructure,
    documentsSubmitted,
    backgroundVerified,
    hasAccount,
    offerLetterIssued,
    agreementConfirmed,
    appointmentLetterIssued,
    idCardIssued,
    hasAutoDeposit,
  ].every(Boolean);

  if (allDone) {
    if (employee.onboardingComplete === true) return; // already complete, no-op
    await prisma.employee.update({
      where: { id: employeeId },
      data: { onboardingComplete: true },
    });

    // ── Auto-generate employee code if not set ──
    // Format: EMP-0001 (company-wide, gap-free sequence)
    if (employee.userId && employee.user && !employee.user.employeeCode) {
      try {
        const employeeCode = await prisma.$transaction(async (tx) => {
          return nextSequenceNumber(tx, `EMP-${companyId}-`, 4);
        });
        await prisma.user.update({
          where: { id: employee.userId },
          data: { employeeCode },
        });
      } catch {
        // Best-effort — don't fail onboarding if code generation fails
      }
    }
  } else if (employee.onboardingComplete === true) {
    // A step was undone (e.g. auto-deposit disabled) — unmark onboarding
    await prisma.employee.update({
      where: { id: employeeId },
      data: { onboardingComplete: false },
    });
  }
}

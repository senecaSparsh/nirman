/**
 * buildOnboardingSteps — shared onboarding step computation.
 *
 * Pure function with no client/server dependencies — safe to import from
 * both Server Components and Client Components. Used by the onboarding
 * tab, queue page, and profile page so they all agree on what "complete"
 * means.
 */

export interface OnboardingStep {
  label: string;
  done: boolean;
}

export function buildOnboardingSteps(opts: {
  hasProfile: boolean;
  hasWage: boolean;
  hasEmploymentTerms: boolean;
  hasSalaryStructure: boolean;
  documentsSubmitted: boolean;
  backgroundVerified: boolean;
  hasAccount: boolean;
  offerLetterIssued: boolean;
  agreementIssued: boolean;
  agreementConfirmed: boolean;
  appointmentLetterIssued: boolean;
  idCardIssued: boolean;
  hasAutoDeposit: boolean;
}): { steps: OnboardingStep[]; completedCount: number; isComplete: boolean } {
  const steps: OnboardingStep[] = [
    { label: "Profile & Wage", done: opts.hasProfile && opts.hasWage },
    { label: "Employment Terms", done: opts.hasEmploymentTerms },
    { label: "Salary Structure", done: opts.hasSalaryStructure },
    { label: "Documents", done: opts.documentsSubmitted },
    { label: "BG Verification", done: opts.backgroundVerified },
    { label: "Login Account", done: opts.hasAccount },
    { label: "Offer Letter", done: opts.offerLetterIssued },
    { label: "Agreement Issued", done: opts.agreementIssued },
    { label: "Agreement Confirmed", done: opts.agreementConfirmed },
    { label: "Appointment Letter", done: opts.appointmentLetterIssued },
    { label: "ID Card", done: opts.idCardIssued },
    { label: "Auto-Deposit", done: opts.hasAutoDeposit },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  return { steps, completedCount, isComplete: completedCount === steps.length };
}

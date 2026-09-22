// Shared salary-structure constants — used by the mobile onboarding salary
// tab and the desktop employee-profile salary section. The option lists must
// stay aligned with SalaryComponentType in the Prisma schema and the
// salaryComponentsSetSchema in lib/server.ts.

export const SALARY_COMPONENT_OPTIONS = [
  { value: "BASIC", label: "Basic Salary", isDeduction: false },
  { value: "HRA", label: "HRA (House Rent)", isDeduction: false },
  { value: "DA", label: "DA (Dearness Allowance)", isDeduction: false },
  { value: "TA", label: "TA (Travelling Allowance)", isDeduction: false },
  { value: "SPECIAL_ALLOWANCE", label: "Special Allowance", isDeduction: false },
  { value: "FOOD_ALLOWANCE", label: "Food Allowance", isDeduction: false },
  { value: "MEDICAL_ALLOWANCE", label: "Medical Allowance", isDeduction: false },
  { value: "UNIFORM_ALLOWANCE", label: "Uniform Allowance", isDeduction: false },
  { value: "WASHING_ALLOWANCE", label: "Washing Allowance", isDeduction: false },
  { value: "LTA", label: "LTA (Leave Travel)", isDeduction: false },
  { value: "PERFORMANCE_BONUS", label: "Performance Bonus", isDeduction: false },
  { value: "JOINING_BONUS", label: "Joining Bonus", isDeduction: false },
  { value: "EMPLOYER_PF", label: "Employer PF (12% of basic)", isDeduction: false },
  { value: "EMPLOYEE_PF", label: "Employee PF (deducted)", isDeduction: true },
  { value: "EMPLOYER_ESI", label: "Employer ESI (3.25%)", isDeduction: false },
  { value: "EMPLOYEE_ESI", label: "Employee ESI (0.75%, deducted)", isDeduction: true },
  { value: "GRATUITY", label: "Gratuity (4.81% of basic)", isDeduction: false },
  { value: "PROFESSION_TAX", label: "Profession Tax (deducted)", isDeduction: true },
  { value: "TDS", label: "TDS / Income Tax (deducted)", isDeduction: true },
  { value: "OTHER", label: "Other", isDeduction: false },
] as const;

/** Unit options for UNIT_RATE components — paid per actual usage. */
export const SALARY_UNIT_OPTIONS = [
  { value: "DAY", label: "per day worked", hint: "auto-counts attendance days" },
  { value: "KM", label: "per km", hint: "e.g. travel ₹3/km" },
  { value: "TRIP", label: "per trip", hint: "e.g. ₹500/trip" },
  { value: "HOUR", label: "per hour", hint: "" },
  { value: "MONTH", label: "per month", hint: "" },
  { value: "CUSTOM", label: "custom unit", hint: "name it below" },
] as const;

export const SALARY_FREQUENCY_OPTIONS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-yearly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONE_TIME", label: "One-time" },
] as const;

export type SalaryComponentCalc = "FIXED" | "PERCENTAGE_OF_BASIC" | "UNIT_RATE";

export type SalaryComponentRow = {
  id: string;
  type: string;
  amount: number;
  frequency: string;
  isDeduction: boolean;
  isPercentage: boolean;
  percentageOfBasic: number | null;
  calculationType: SalaryComponentCalc | null;
  unitType: string | null;
  unitLabel: string | null;
  notes: string | null;
  active?: boolean;
};

/** Effective calc type — isPercentage covers rows written before the
 *  calculationType field existed. */
export function compCalc(c: { calculationType?: string | null; isPercentage?: boolean }): SalaryComponentCalc {
  if (c.calculationType === "UNIT_RATE") return "UNIT_RATE";
  if (c.calculationType === "PERCENTAGE_OF_BASIC" || c.isPercentage) return "PERCENTAGE_OF_BASIC";
  return "FIXED";
}

/** Short unit label for display: "₹3/km", "₹150/day", "₹500/trip". */
export function unitSuffix(unitType: string | null, unitLabel: string | null): string {
  switch (unitType) {
    case "DAY": return "/day";
    case "KM": return "/km";
    case "TRIP": return "/trip";
    case "HOUR": return "/hr";
    case "MONTH": return "/mo";
    case "CUSTOM": return unitLabel ? `/${unitLabel}` : "";
    default: return "";
  }
}

export function componentLabel(type: string): string {
  return SALARY_COMPONENT_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/** Frequency label used in summaries — "MONTHLY" → "monthly". */
export function frequencyLabel(frequency: string): string {
  return SALARY_FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.label ?? frequency.toLowerCase();
}

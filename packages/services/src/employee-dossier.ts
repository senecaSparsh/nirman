import { prisma, Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { HrError } from "./hr";

// ───────────────────────────────────────────────────────────────
//  Employee Dossier — employment terms, bank, tax, benefits,
//  emergency contact, address. These are the "HR file" fields
//  that go beyond the operational Employee model (wage, crew,
//  attendance). Managed as editable sections on the profile page.
// ───────────────────────────────────────────────────────────────

/** Fields that can be updated on the Employee record via the dossier. */
export type EmployeeDossierInput = {
  employmentType?: "PERMANENT" | "CONTRACT" | "CASUAL" | "PROBATION" | "INTERN" | null;
  probationEndDate?: string | null;
  confirmationDate?: string | null;
  noticePeriodDays?: number | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  payDay?: number | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  pfNumber?: string | null;
  esiNumber?: string | null;
  uan?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  permanentAddress?: string | null;
  currentAddress?: string | null;
  // Identity / personal (for ID card & compliance)
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
  photoUrl?: string | null;
  // Onboarding checklist
  documentsSubmitted?: boolean | null;
  backgroundVerified?: boolean | null;
};

/** Parse an optional dossier date — throws a 400 instead of letting an
 *  Invalid Date reach Prisma and surface as a 500. */
function parseDossierDate(value: string, field: string): Date {
  // Raw-body payloads can carry non-strings (e.g. a number would silently
  // become an epoch date) — reject anything that isn't a date string.
  if (typeof value !== "string") throw new HrError(`Invalid ${field} format`, 400);
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new HrError(`Invalid ${field} format`, 400);
  return d;
}

/** Update the dossier fields on an Employee record. */
export async function updateEmployeeDossier(
  employeeId: string,
  companyId: string,
  userId: string,
  input: EmployeeDossierInput,
) {
  return prisma.$transaction(async (tx) => {
    // Guard: the route checks existence before calling, but the row could be
    // deleted in between — a scoped findFirst turns that into a clean 404
    // instead of a raw P2025 500.
    const existing = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new HrError("Employee not found", 404);

    const data: Prisma.EmployeeUpdateInput = {};

    if (input.employmentType !== undefined) data.employmentType = input.employmentType ?? null;
    if (input.probationEndDate !== undefined) data.probationEndDate = input.probationEndDate ? parseDossierDate(input.probationEndDate, "probation end date") : null;
    if (input.confirmationDate !== undefined) data.confirmationDate = input.confirmationDate ? parseDossierDate(input.confirmationDate, "confirmation date") : null;
    if (input.noticePeriodDays !== undefined) data.noticePeriodDays = input.noticePeriodDays ?? null;
    if (input.contractStartDate !== undefined) data.contractStartDate = input.contractStartDate ? parseDossierDate(input.contractStartDate, "contract start date") : null;
    if (input.contractEndDate !== undefined) data.contractEndDate = input.contractEndDate ? parseDossierDate(input.contractEndDate, "contract end date") : null;
    if (input.payDay !== undefined) data.payDay = input.payDay ?? null;
    if (input.bankAccountHolder !== undefined) data.bankAccountHolder = input.bankAccountHolder ?? null;
    if (input.bankAccountNumber !== undefined) data.bankAccountNumber = input.bankAccountNumber ?? null;
    if (input.bankIfsc !== undefined) {
      const ifsc = input.bankIfsc?.trim().toUpperCase() || null;
      // Same RBI format rule as setupAutoDeposit — catch bad values at
      // write time instead of when auto-deposit is enabled.
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        throw new HrError("Bank IFSC code is invalid (e.g. HDFC0001234).", 400);
      }
      data.bankIfsc = ifsc;
    }
    if (input.bankName !== undefined) data.bankName = input.bankName ?? null;
    if (input.bankBranch !== undefined) data.bankBranch = input.bankBranch ?? null;
    if (input.panNumber !== undefined) data.panNumber = input.panNumber ?? null;
    if (input.aadhaarNumber !== undefined) data.aadhaarNumber = input.aadhaarNumber ?? null;
    if (input.pfNumber !== undefined) data.pfNumber = input.pfNumber ?? null;
    if (input.esiNumber !== undefined) data.esiNumber = input.esiNumber ?? null;
    if (input.uan !== undefined) data.uan = input.uan ?? null;
    if (input.emergencyContactName !== undefined) data.emergencyContactName = input.emergencyContactName ?? null;
    if (input.emergencyContactPhone !== undefined) data.emergencyContactPhone = input.emergencyContactPhone ?? null;
    if (input.emergencyContactRelation !== undefined) data.emergencyContactRelation = input.emergencyContactRelation ?? null;
    if (input.permanentAddress !== undefined) data.permanentAddress = input.permanentAddress ?? null;
    if (input.currentAddress !== undefined) data.currentAddress = input.currentAddress ?? null;
    if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth ? parseDossierDate(input.dateOfBirth, "date of birth") : null;
    if (input.bloodGroup !== undefined) data.bloodGroup = input.bloodGroup ?? null;
    if (input.photoUrl !== undefined) data.photoUrl = input.photoUrl ?? null;
    if (input.documentsSubmitted !== undefined) data.documentsSubmitted = input.documentsSubmitted ?? null;
    if (input.backgroundVerified !== undefined) data.backgroundVerified = input.backgroundVerified ?? null;

    const employee = await tx.employee.update({ where: { id: employeeId }, data });

    await logAction(tx, {
      userId,
      companyId,
      action: "EMPLOYEE_DOSSIER_UPDATE",
      entityType: "Employee",
      entityId: employeeId,
      after: input as Record<string, unknown>,
    });

    return employee;
  });
}

// ── Benefits CRUD ──

export type CreateBenefitInput = {
  employeeId: string;
  type: "PF" | "ESI" | "HEALTH_INSURANCE" | "ACCIDENT_INSURANCE" | "BONUS" | "LEAVE_ENCASHMENT" | "ACCOMMODATION" | "TRAVEL_ALLOWANCE" | "FOOD_ALLOWANCE" | "UNIFORM" | "PPE" | "OTHER";
  amount?: number | null;
  frequency?: "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "ON_DEMAND";
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
};

export async function createEmployeeBenefit(
  input: CreateBenefitInput,
  companyId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const benefit = await tx.employeeBenefit.create({
      data: {
        employeeId: input.employeeId,
        type: input.type,
        amount: input.amount != null ? new Prisma.Decimal(input.amount) : null,
        frequency: input.frequency ?? "MONTHLY",
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        notes: input.notes ?? null,
      },
    });

    await logAction(tx, {
      userId,
      companyId,
      action: "EMPLOYEE_BENEFIT_CREATE",
      entityType: "EmployeeBenefit",
      entityId: benefit.id,
      after: { ...input, employeeId: input.employeeId } as Record<string, unknown>,
    });

    return benefit;
  });
}

export type UpdateBenefitInput = {
  type?: CreateBenefitInput["type"];
  amount?: number | null;
  frequency?: CreateBenefitInput["frequency"];
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function updateEmployeeBenefit(
  benefitId: string,
  companyId: string,
  userId: string,
  input: UpdateBenefitInput,
) {
  return prisma.$transaction(async (tx) => {
    const data: Prisma.EmployeeBenefitUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.amount !== undefined) data.amount = input.amount != null ? new Prisma.Decimal(input.amount) : null;
    if (input.frequency !== undefined) data.frequency = input.frequency;
    if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.active !== undefined) data.active = input.active;

    const benefit = await tx.employeeBenefit.update({ where: { id: benefitId }, data });

    await logAction(tx, {
      userId,
      companyId,
      action: "EMPLOYEE_BENEFIT_UPDATE",
      entityType: "EmployeeBenefit",
      entityId: benefitId,
      after: input as Record<string, unknown>,
    });

    return benefit;
  });
}

export async function deleteEmployeeBenefit(
  benefitId: string,
  companyId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.employeeBenefit.delete({ where: { id: benefitId } });

    await logAction(tx, {
      userId,
      companyId,
      action: "EMPLOYEE_BENEFIT_DELETE",
      entityType: "EmployeeBenefit",
      entityId: benefitId,
    });
  });
}

// ───────────────────────────────────────────────────────────────
//  Salary Components — CTC breakdown (Basic, HRA, DA, TA, etc.)
//  Each employee can have multiple salary components that together
//  form their salary structure. Used in offer letters, agreements,
//  and payroll computation.
// ───────────────────────────────────────────────────────────────

export type SalaryComponentTypeInput =
  | "BASIC" | "HRA" | "DA" | "TA" | "SPECIAL_ALLOWANCE"
  | "FOOD_ALLOWANCE" | "MEDICAL_ALLOWANCE" | "UNIFORM_ALLOWANCE"
  | "WASHING_ALLOWANCE" | "LTA" | "PERFORMANCE_BONUS"
  | "JOINING_BONUS" | "RETENTION_BONUS"
  | "EMPLOYER_PF" | "EMPLOYEE_PF" | "EMPLOYER_ESI" | "EMPLOYEE_ESI"
  | "GRATUITY" | "PROFESSION_TAX" | "TDS" | "OTHER";

export type ComponentFrequencyInput =
  | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ONE_TIME";

export type SalaryCalcTypeInput = "FIXED" | "PERCENTAGE_OF_BASIC" | "UNIT_RATE";
export type SalaryUnitTypeInput = "DAY" | "KM" | "TRIP" | "HOUR" | "MONTH" | "CUSTOM";

export type CreateSalaryComponentInput = {
  employeeId: string;
  type: SalaryComponentTypeInput;
  /** FIXED: the amount. UNIT_RATE: the per-unit rate (e.g. 3 = ₹3/km).
   *  PERCENTAGE_OF_BASIC: ignored (use percentageOfBasic). */
  amount: number;
  frequency?: ComponentFrequencyInput;
  isDeduction?: boolean;
  /** @deprecated prefer calculationType — kept for backward compat, still honored. */
  isPercentage?: boolean;
  percentageOfBasic?: number | null;
  calculationType?: SalaryCalcTypeInput;
  unitType?: SalaryUnitTypeInput | null;
  unitLabel?: string | null;
  notes?: string | null;
};

/**
 * Normalize a component input into its calculation mode. Accepts the legacy
 * `isPercentage` flag when `calculationType` isn't sent. `isPercentage` on the
 * row stays derived from calculationType so older readers keep working.
 */
function resolveComponentCalc(input: {
  calculationType?: SalaryCalcTypeInput;
  isPercentage?: boolean;
  unitType?: SalaryUnitTypeInput | null;
}) {
  const calculationType: SalaryCalcTypeInput =
    input.calculationType ?? (input.isPercentage ? "PERCENTAGE_OF_BASIC" : "FIXED");
  const unitType = calculationType === "UNIT_RATE" ? input.unitType ?? null : null;
  if (calculationType === "UNIT_RATE" && !unitType) {
    throw new HrError(
      "Unit-rate components need a unitType (DAY, KM, TRIP, HOUR, MONTH or CUSTOM)",
      400,
    );
  }
  return {
    calculationType,
    isPercentage: calculationType === "PERCENTAGE_OF_BASIC",
    unitType,
  };
}

export async function createSalaryComponent(
  input: CreateSalaryComponentInput,
  companyId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Verify employee belongs to this company
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    const calc = resolveComponentCalc(input);

    // Upsert: if a component of this type already exists, update it
    const component = await tx.salaryComponent.upsert({
      where: {
        employeeId_type: { employeeId: input.employeeId, type: input.type },
      },
      create: {
        employeeId: input.employeeId,
        type: input.type,
        amount: new Prisma.Decimal(input.amount),
        frequency: input.frequency ?? "MONTHLY",
        isDeduction: input.isDeduction ?? false,
        isPercentage: calc.isPercentage,
        percentageOfBasic: input.percentageOfBasic != null ? new Prisma.Decimal(input.percentageOfBasic) : null,
        calculationType: calc.calculationType,
        unitType: calc.unitType,
        unitLabel: input.unitLabel ?? null,
        notes: input.notes ?? null,
      },
      update: {
        amount: new Prisma.Decimal(input.amount),
        frequency: input.frequency ?? "MONTHLY",
        isDeduction: input.isDeduction ?? false,
        isPercentage: calc.isPercentage,
        percentageOfBasic: input.percentageOfBasic != null ? new Prisma.Decimal(input.percentageOfBasic) : null,
        calculationType: calc.calculationType,
        unitType: calc.unitType,
        unitLabel: input.unitLabel ?? null,
        notes: input.notes ?? null,
      },
    });

    await logAction(tx, {
      userId,
      companyId,
      action: "SALARY_COMPONENT_CREATE",
      entityType: "SalaryComponent",
      entityId: component.id,
      after: { ...input, employeeId: input.employeeId } as Record<string, unknown>,
    });

    return component;
  });
}

export type UpdateSalaryComponentInput = {
  amount?: number;
  frequency?: ComponentFrequencyInput;
  isDeduction?: boolean;
  isPercentage?: boolean;
  percentageOfBasic?: number | null;
  calculationType?: SalaryCalcTypeInput;
  unitType?: SalaryUnitTypeInput | null;
  unitLabel?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function updateSalaryComponent(
  componentId: string,
  companyId: string,
  userId: string,
  input: UpdateSalaryComponentInput,
) {
  return prisma.$transaction(async (tx) => {
    const data: Prisma.SalaryComponentUpdateInput = {};
    if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);
    if (input.frequency !== undefined) data.frequency = input.frequency;
    if (input.isDeduction !== undefined) data.isDeduction = input.isDeduction;
    if (input.percentageOfBasic !== undefined) data.percentageOfBasic = input.percentageOfBasic != null ? new Prisma.Decimal(input.percentageOfBasic) : null;
    if (input.unitLabel !== undefined) data.unitLabel = input.unitLabel ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.active !== undefined) data.active = input.active;

    // Calculation-mode fields resolve against the existing row so a partial
    // update (e.g. only unitType) can't leave an invalid combination.
    if (
      input.calculationType !== undefined ||
      input.isPercentage !== undefined ||
      input.unitType !== undefined
    ) {
      const existing = await tx.salaryComponent.findUnique({
        where: { id: componentId },
        select: { calculationType: true, isPercentage: true, unitType: true },
      });
      if (!existing) throw new HrError("Salary component not found", 404);
      const calc = resolveComponentCalc({
        // Explicit new mode wins; legacy isPercentage flag maps next;
        // otherwise keep the stored mode.
        calculationType:
          input.calculationType ??
          (input.isPercentage !== undefined
            ? undefined
            : existing.calculationType),
        isPercentage: input.isPercentage ?? existing.isPercentage,
        unitType:
          input.unitType !== undefined
            ? input.unitType
            : existing.unitType,
      });
      data.calculationType = calc.calculationType;
      data.isPercentage = calc.isPercentage;
      data.unitType = calc.unitType;
    }

    const component = await tx.salaryComponent.update({ where: { id: componentId }, data });

    await logAction(tx, {
      userId,
      companyId,
      action: "SALARY_COMPONENT_UPDATE",
      entityType: "SalaryComponent",
      entityId: componentId,
      after: input as Record<string, unknown>,
    });

    return component;
  });
}

export async function deleteSalaryComponent(
  componentId: string,
  companyId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.salaryComponent.delete({ where: { id: componentId } });

    await logAction(tx, {
      userId,
      companyId,
      action: "SALARY_COMPONENT_DELETE",
      entityType: "SalaryComponent",
      entityId: componentId,
    });
  });
}

/**
 * Batch-set salary components for an employee — replaces all existing
 * components with the provided list. Used by the hiring form to set
 * the full salary structure in one call.
 *
 * After persisting the new components, an immutable `SalaryHistory` record
 * is created that snapshots the new salary structure as JSON and records
 * the actor (`changedBy`), an optional `changeReason`, and the
 * `effectiveFrom` date. This gives a full audit trail of every salary
 * change over time.
 */
export async function setSalaryComponents(
  employeeId: string,
  companyId: string,
  userId: string,
  // employeeId comes from the function arg, not per-component — Omit it so
  // callers don't have to repeat it on every row.
  components: Omit<CreateSalaryComponentInput, "employeeId">[],
  options?: { changedBy?: string; changeReason?: string; effectiveFrom?: Date },
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true, wageType: true, dailyRate: true, monthlySalary: true },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    // Delete existing components
    await tx.salaryComponent.deleteMany({ where: { employeeId } });

    // Create new ones
    const created = await Promise.all(
      components.map((c) => {
        const calc = resolveComponentCalc(c);
        return tx.salaryComponent.create({
          data: {
            employeeId,
            type: c.type,
            amount: new Prisma.Decimal(c.amount),
            frequency: c.frequency ?? "MONTHLY",
            isDeduction: c.isDeduction ?? false,
            isPercentage: calc.isPercentage,
            percentageOfBasic: c.percentageOfBasic != null ? new Prisma.Decimal(c.percentageOfBasic) : null,
            calculationType: calc.calculationType,
            unitType: calc.unitType,
            unitLabel: c.unitLabel ?? null,
            notes: c.notes ?? null,
          },
        });
      }),
    );

    // ── Sync the Employee.wage fields from salary components ──
    // The offer letter / agreement generation validates that the employee
    // has a wage set (dailyRate for DAILY, monthlySalary for MONTHLY/FIXED).
    // When salary components are saved, auto-compute and sync these fields
    // ONLY when no wage was set by hand — never overwrite an explicit rate
    // (e.g. a ₹850/day mason's agreed rate) with a derived monthly/30 value.
    // UNIT_RATE components are excluded — their `amount` is a per-unit rate
    // (₹3/km), not a monthly sum, so they can't count toward a fixed wage.
    const monthlyEarnings = components
      .filter(
        (c) =>
          !c.isDeduction &&
          (c.frequency ?? "MONTHLY") === "MONTHLY" &&
          resolveComponentCalc(c).calculationType !== "UNIT_RATE",
      )
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const updateData: Prisma.EmployeeUpdateInput = {};
    if (employee.wageType === "DAILY") {
      // For daily wage, compute daily rate from monthly earnings / 30
      if (monthlyEarnings > 0 && Number(employee.dailyRate ?? 0) <= 0) {
        updateData.dailyRate = new Prisma.Decimal(Math.round((monthlyEarnings / 30) * 100) / 100);
      }
    } else {
      // MONTHLY or FIXED — sync monthlySalary from the sum of monthly earnings
      if (monthlyEarnings > 0 && Number(employee.monthlySalary ?? 0) <= 0) {
        updateData.monthlySalary = new Prisma.Decimal(monthlyEarnings);
      }
    }
    if (Object.keys(updateData).length > 0) {
      await tx.employee.update({ where: { id: employeeId }, data: updateData });
    }

    await logAction(tx, {
      userId,
      companyId,
      action: "SALARY_COMPONENTS_SET",
      entityType: "Employee",
      entityId: employeeId,
      after: { count: created.length } as Record<string, unknown>,
    });

    // ── Salary history log ──
    // Snapshot the new salary structure as JSON and compute the total
    // annual CTC so we have an immutable audit trail of every change.
    const changedBy = options?.changedBy ?? userId;
    const effectiveFrom = options?.effectiveFrom ?? new Date();

    const componentSnapshot = components.map((c) => {
      const calc = resolveComponentCalc(c);
      return {
        type: c.type,
        amount: Number(c.amount),
        frequency: c.frequency ?? "MONTHLY",
        isDeduction: c.isDeduction ?? false,
        calculationType: calc.calculationType,
        unitType: calc.unitType,
        unitLabel: c.unitLabel ?? null,
        percentageOfBasic: c.percentageOfBasic != null ? Number(c.percentageOfBasic) : null,
      };
    });

    // totalCtc = sum(monthly × 12) + sum(yearly) + sum(one-time).
    // UNIT_RATE components are variable (rate × actual usage) — they have no
    // fixed annual value, so they're excluded from CTC.
    const totalCtc = components.reduce((sum, c) => {
      if (resolveComponentCalc(c).calculationType === "UNIT_RATE") return sum;
      const amt = Number(c.amount);
      const freq = c.frequency ?? "MONTHLY";
      if (freq === "MONTHLY") return sum + amt * 12;
      if (freq === "YEARLY") return sum + amt;
      if (freq === "ONE_TIME") return sum + amt;
      return sum;
    }, 0);

    await tx.salaryHistory.create({
      data: {
        employeeId,
        companyId,
        changedBy,
        changeReason: options?.changeReason ?? null,
        components: componentSnapshot as unknown as Prisma.InputJsonValue,
        totalCtc: new Prisma.Decimal(totalCtc),
        effectiveFrom,
      },
    });

    return created;
  });
}

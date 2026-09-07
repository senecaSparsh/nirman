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
};

/** Update the dossier fields on an Employee record. */
export async function updateEmployeeDossier(
  employeeId: string,
  companyId: string,
  userId: string,
  input: EmployeeDossierInput,
) {
  return prisma.$transaction(async (tx) => {
    const data: Prisma.EmployeeUpdateInput = {};

    if (input.employmentType !== undefined) data.employmentType = input.employmentType ?? null;
    if (input.probationEndDate !== undefined) data.probationEndDate = input.probationEndDate ? new Date(input.probationEndDate) : null;
    if (input.confirmationDate !== undefined) data.confirmationDate = input.confirmationDate ? new Date(input.confirmationDate) : null;
    if (input.noticePeriodDays !== undefined) data.noticePeriodDays = input.noticePeriodDays ?? null;
    if (input.contractStartDate !== undefined) data.contractStartDate = input.contractStartDate ? new Date(input.contractStartDate) : null;
    if (input.contractEndDate !== undefined) data.contractEndDate = input.contractEndDate ? new Date(input.contractEndDate) : null;
    if (input.payDay !== undefined) data.payDay = input.payDay ?? null;
    if (input.bankAccountHolder !== undefined) data.bankAccountHolder = input.bankAccountHolder ?? null;
    if (input.bankAccountNumber !== undefined) data.bankAccountNumber = input.bankAccountNumber ?? null;
    if (input.bankIfsc !== undefined) data.bankIfsc = input.bankIfsc ?? null;
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

export type CreateSalaryComponentInput = {
  employeeId: string;
  type: SalaryComponentTypeInput;
  amount: number;
  frequency?: ComponentFrequencyInput;
  isDeduction?: boolean;
  isPercentage?: boolean;
  percentageOfBasic?: number | null;
  notes?: string | null;
};

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
        isPercentage: input.isPercentage ?? false,
        percentageOfBasic: input.percentageOfBasic != null ? new Prisma.Decimal(input.percentageOfBasic) : null,
        notes: input.notes ?? null,
      },
      update: {
        amount: new Prisma.Decimal(input.amount),
        frequency: input.frequency ?? "MONTHLY",
        isDeduction: input.isDeduction ?? false,
        isPercentage: input.isPercentage ?? false,
        percentageOfBasic: input.percentageOfBasic != null ? new Prisma.Decimal(input.percentageOfBasic) : null,
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
    if (input.isPercentage !== undefined) data.isPercentage = input.isPercentage;
    if (input.percentageOfBasic !== undefined) data.percentageOfBasic = input.percentageOfBasic != null ? new Prisma.Decimal(input.percentageOfBasic) : null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.active !== undefined) data.active = input.active;

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
 */
export async function setSalaryComponents(
  employeeId: string,
  companyId: string,
  userId: string,
  components: CreateSalaryComponentInput[],
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    // Delete existing components
    await tx.salaryComponent.deleteMany({ where: { employeeId } });

    // Create new ones
    const created = await Promise.all(
      components.map((c) =>
        tx.salaryComponent.create({
          data: {
            employeeId,
            type: c.type,
            amount: new Prisma.Decimal(c.amount),
            frequency: c.frequency ?? "MONTHLY",
            isDeduction: c.isDeduction ?? false,
            isPercentage: c.isPercentage ?? false,
            percentageOfBasic: c.percentageOfBasic != null ? new Prisma.Decimal(c.percentageOfBasic) : null,
            notes: c.notes ?? null,
          },
        }),
      ),
    );

    await logAction(tx, {
      userId,
      companyId,
      action: "SALARY_COMPONENTS_SET",
      entityType: "Employee",
      entityId: employeeId,
      after: { count: created.length } as Record<string, unknown>,
    });

    return created;
  });
}

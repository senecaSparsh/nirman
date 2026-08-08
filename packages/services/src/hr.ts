import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postPayroll, postPayrollPayment } from "./gl-posting";
import { runDprVarianceAnalysis } from "./standard-consumption";
import { reallocateProjectCosts } from "./valuation";

/**
 * HR & Field Workforce Service — crews, attendance, payroll, and Daily
 * Progress Reports (DPR).
 *
 * This is the third whiteboard module. Employees (site labour) are grouped
 * into crews assigned to a project. Daily attendance (check-in/out, status,
 * hours) is recorded per worker. Payroll is generated from attendance:
 *   - DAILY workers  → dailyRate × daysWorked
 *   - MONTHLY workers → monthlySalary prorated by attendance
 *   - FIXED workers   → agreed monthlySalary (attendance informational)
 * Plus overtime (hours > 8 × hourlyRate × 1.5) and manual deductions.
 *
 * Payroll posts to the GL atomically:
 *   PROCESS: Dr Salaries Expense, Cr Salaries Payable
 *   PAY:     Dr Salaries Payable, Cr Cash
 *
 * DPRs capture site execution (work done, materials consumed, labour
 * utilised, progress %). DPR material lines are INFORMATIONAL — they report
 * consumption but do NOT auto-issue stock (the MaterialIssue flow remains
 * the single source of truth for stock). This avoids double-counting.
 *
 * Every mutation runs inside a Serializable transaction that appends an
 * AuditLog row.
 */

const STANDARD_HOURS_PER_DAY = 8;
const OVERTIME_MULTIPLIER = 1.5;

/** Error with an HTTP-ish status code (mirrors TaskError pattern). */
export class HrError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "HrError";
    this.status = status;
  }
}

// ───────────────────────────────────────────────────────────
//  Pure helpers (unit-testable — no DB access)
// ───────────────────────────────────────────────────────────

/** Weight of an attendance status toward "days worked". */
export function attendanceWeight(status: string): number {
  switch (status) {
    case "PRESENT":
    case "OVERTIME":
      return 1;
    case "HALF_DAY":
      return 0.5;
    default: // ABSENT, LEAVE
      return 0;
  }
}

/** Sum present-days from a list of attendance records. */
export function computeDaysWorked(
  attendances: { status: string }[],
): Decimal {
  return attendances.reduce(
    (sum, a) => sum.plus(attendanceWeight(a.status)),
    new Decimal(0),
  );
}

/** Overtime hours = Σ max(0, hoursWorked − 8) for attended days. */
export function computeOvertimeHours(
  attendances: { status: string; hoursWorked?: Decimal | number | string | null }[],
): Decimal {
  return attendances.reduce((sum, a) => {
    if (a.status === "ABSENT" || a.status === "LEAVE") return sum;
    const hrs = a.hoursWorked != null ? new Decimal(a.hoursWorked) : new Decimal(0);
    const ot = hrs.minus(STANDARD_HOURS_PER_DAY);
    return ot.gt(0) ? sum.plus(ot) : sum;
  }, new Decimal(0));
}

/** Count working days (Mon–Sat, excluding Sunday) in a date range. */
export function computeWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cur.getTime() <= end.getTime()) {
    if (cur.getDay() !== 0) count++; // 0 = Sunday
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1);
}

/** Hourly rate implied by a worker's wage structure. */
export function hourlyRateFor(
  employee: { wageType: string; dailyRate: Decimal | number | string; monthlySalary?: Decimal | number | string | null },
  workingDaysInPeriod: number,
): Decimal {
  const daily = new Decimal(employee.dailyRate || 0);
  if (employee.wageType === "DAILY") {
    return daily.div(STANDARD_HOURS_PER_DAY);
  }
  if (employee.wageType === "MONTHLY" && employee.monthlySalary != null) {
    return new Decimal(employee.monthlySalary)
      .div(workingDaysInPeriod * STANDARD_HOURS_PER_DAY);
  }
  // FIXED → no implied overtime (piece-rate); overtime tracked separately.
  return new Decimal(0);
}

/** Basic pay for the period given the wage type and days worked. */
export function computeBasicAmount(
  employee: { wageType: string; dailyRate: Decimal | number | string; monthlySalary?: Decimal | number | string | null },
  daysWorked: Decimal,
  workingDaysInPeriod: number,
): Decimal {
  const days = daysWorked;
  if (employee.wageType === "DAILY") {
    return new Decimal(employee.dailyRate || 0).times(days);
  }
  if (employee.wageType === "MONTHLY" && employee.monthlySalary != null) {
    // Prorate by attendance: salary × (daysWorked / workingDays).
    return new Decimal(employee.monthlySalary)
      .times(days)
      .div(workingDaysInPeriod);
  }
  // FIXED → agreed amount, paid in full regardless of attendance.
  return employee.monthlySalary != null ? new Decimal(employee.monthlySalary) : new Decimal(0);
}

/** grossPay = basic + overtime + allowance + bonus. */
export function computeGrossPay(
  basic: Decimal | number | string,
  overtime: Decimal | number | string,
  allowance: Decimal | number | string = 0,
  bonus: Decimal | number | string = 0,
): Decimal {
  return new Decimal(basic).plus(overtime).plus(allowance).plus(bonus);
}

/** totalDeductions = deductions + pf + tax. */
export function computeTotalDeductions(
  deductions: Decimal | number | string,
  pf: Decimal | number | string = 0,
  tax: Decimal | number | string = 0,
): Decimal {
  return new Decimal(deductions).plus(pf).plus(tax);
}

/** netPay = grossPay − totalDeductions. */
export function computeNetPay(
  basic: Decimal | number | string,
  overtime: Decimal | number | string,
  deductions: Decimal | number | string,
  allowance: Decimal | number | string = 0,
  bonus: Decimal | number | string = 0,
  pf: Decimal | number | string = 0,
  tax: Decimal | number | string = 0,
): Decimal {
  const gross = computeGrossPay(basic, overtime, allowance, bonus);
  const totalDed = computeTotalDeductions(deductions, pf, tax);
  return gross.minus(totalDed);
}

// ───────────────────────────────────────────────────────────
//  Crews
// ───────────────────────────────────────────────────────────

export interface CreateCrewInput {
  companyId: string;
  name: string;
  projectId?: string;
  supervisorId?: string;
  memberIds?: string[];
  userId?: string;
}

export async function createCrew(input: CreateCrewInput) {
  return prisma.$transaction(async (tx) => {
    if (input.supervisorId) {
      const sup = await tx.employee.findFirst({
        where: { id: input.supervisorId, companyId: input.companyId, deletedAt: null },
      });
      if (!sup) throw new HrError("Supervisor not found in this company", 404);
    }
    if (input.projectId) {
      const proj = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      });
      if (!proj) throw new HrError("Project not found in this company", 404);
    }
    const crew = await tx.crew.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        projectId: input.projectId ?? null,
        supervisorId: input.supervisorId ?? null,
        active: true,
      },
    });
    // Assign members by setting their crewId.
    if (input.memberIds?.length) {
      await tx.employee.updateMany({
        where: { id: { in: input.memberIds }, companyId: input.companyId, deletedAt: null },
        data: { crewId: crew.id },
      });
    }
    await logAction(tx, {
      userId: input.userId,
      action: "CREW_CREATE",
      entityType: "Crew",
      entityId: crew.id,
      after: { name: crew.name, projectId: crew.projectId, supervisorId: crew.supervisorId, members: input.memberIds?.length ?? 0 },
    });
    return crew;
  });
}

export interface UpdateCrewInput {
  crewId: string;
  name?: string;
  projectId?: string | null;
  supervisorId?: string | null;
  memberIds?: string[];
  active?: boolean;
  userId?: string;
}

export async function updateCrew(input: UpdateCrewInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.crew.findUnique({ where: { id: input.crewId } });
    if (!existing) throw new HrError("Crew not found", 404);

    const data: Prisma.CrewUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.active !== undefined) data.active = input.active;
    if (input.projectId !== undefined) {
      if (input.projectId === null) data.project = { disconnect: true };
      else data.project = { connect: { id: input.projectId } };
    }
    if (input.supervisorId !== undefined) {
      if (input.supervisorId === null) data.supervisor = { disconnect: true };
      else data.supervisor = { connect: { id: input.supervisorId } };
    }

    const updated = await tx.crew.update({ where: { id: input.crewId }, data });

    // Replace membership if memberIds provided.
    if (input.memberIds !== undefined) {
      await tx.employee.updateMany({
        where: { crewId: input.crewId },
        data: { crewId: null },
      });
      if (input.memberIds.length) {
        await tx.employee.updateMany({
          where: { id: { in: input.memberIds }, companyId: existing.companyId, deletedAt: null },
          data: { crewId: input.crewId },
        });
      }
    }

    await logAction(tx, {
      userId: input.userId,
      action: "CREW_UPDATE",
      entityType: "Crew",
      entityId: input.crewId,
      before: { name: existing.name, projectId: existing.projectId, active: existing.active },
      after: { name: updated.name, projectId: updated.projectId, active: updated.active, members: input.memberIds?.length },
    });
    return updated;
  });
}

export async function deleteCrew(crewId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const crew = await tx.crew.findUnique({
      where: { id: crewId },
      include: { _count: { select: { members: true } } },
    });
    if (!crew) throw new HrError("Crew not found", 404);
    if (crew._count.members > 0) {
      throw new HrError(
        `Cannot delete crew with ${crew._count.members} member(s). Reassign them first.`,
        409,
      );
    }
    await tx.crew.delete({ where: { id: crewId } });
    await logAction(tx, {
      userId,
      action: "CREW_DELETE",
      entityType: "Crew",
      entityId: crewId,
      before: { name: crew.name },
    });
    return { deleted: true };
  });
}

// ───────────────────────────────────────────────────────────
//  Employees — master CRUD with audit logging
// ───────────────────────────────────────────────────────────

export interface CreateEmployeeInput {
  companyId: string;
  name: string;
  trade?: string;
  phone?: string;
  email?: string;
  dailyRate?: Decimal | number | string;
  wageType?: "DAILY" | "MONTHLY" | "FIXED";
  monthlySalary?: Decimal | number | string | null;
  designation?: string;
  joinDate?: Date;
  crewId?: string;
  activeProjectId?: string;
  active?: boolean;
  userId?: string;
}

export async function createEmployee(input: CreateEmployeeInput) {
  return prisma.$transaction(async (tx) => {
    if (input.crewId) {
      const crew = await tx.crew.findFirst({
        where: { id: input.crewId, companyId: input.companyId },
      });
      if (!crew) throw new HrError("Crew not found in this company", 404);
    }
    if (input.activeProjectId) {
      const proj = await tx.project.findFirst({
        where: { id: input.activeProjectId, companyId: input.companyId, deletedAt: null },
      });
      if (!proj) throw new HrError("Project not found in this company", 404);
    }
    const employee = await tx.employee.create({
      data: {
        name: input.name,
        trade: input.trade ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        dailyRate: input.dailyRate ?? 0,
        wageType: input.wageType ?? "DAILY",
        monthlySalary: input.monthlySalary ?? null,
        designation: input.designation ?? null,
        joinDate: input.joinDate ?? null,
        crewId: input.crewId || null,
        activeProjectId: input.activeProjectId || null,
        active: input.active ?? true,
        companyId: input.companyId,
      },
    });
    await logAction(tx, {
      userId: input.userId,
      action: "EMPLOYEE_CREATE",
      entityType: "Employee",
      entityId: employee.id,
      after: { name: employee.name, trade: employee.trade, wageType: employee.wageType, dailyRate: employee.dailyRate.toString() },
    });
    return employee;
  });
}

export interface UpdateEmployeeInput {
  employeeId: string;
  companyId: string;
  name?: string;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  dailyRate?: Decimal | number | string;
  wageType?: "DAILY" | "MONTHLY" | "FIXED";
  monthlySalary?: Decimal | number | string | null;
  designation?: string | null;
  joinDate?: Date | null;
  crewId?: string | null;
  activeProjectId?: string | null;
  active?: boolean;
  userId?: string;
}

export async function updateEmployee(input: UpdateEmployeeInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
    });
    if (!existing) throw new HrError("Employee not found in this company", 404);

    if (input.crewId) {
      const crew = await tx.crew.findFirst({
        where: { id: input.crewId, companyId: input.companyId },
      });
      if (!crew) throw new HrError("Crew not found in this company", 404);
    }
    if (input.activeProjectId) {
      const proj = await tx.project.findFirst({
        where: { id: input.activeProjectId, companyId: input.companyId, deletedAt: null },
      });
      if (!proj) throw new HrError("Project not found in this company", 404);
    }

    const data: Prisma.EmployeeUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.trade !== undefined) data.trade = input.trade ?? null;
    if (input.phone !== undefined) data.phone = input.phone ?? null;
    if (input.email !== undefined) data.email = input.email ?? null;
    if (input.dailyRate !== undefined) data.dailyRate = input.dailyRate ?? 0;
    if (input.wageType !== undefined) data.wageType = input.wageType;
    if (input.monthlySalary !== undefined) data.monthlySalary = input.monthlySalary ?? null;
    if (input.designation !== undefined) data.designation = input.designation ?? null;
    if (input.joinDate !== undefined) data.joinDate = input.joinDate;
    if (input.crewId !== undefined) data.crew = input.crewId ? { connect: { id: input.crewId } } : { disconnect: true };
    if (input.activeProjectId !== undefined) data.activeProject = input.activeProjectId ? { connect: { id: input.activeProjectId } } : { disconnect: true };
    if (input.active !== undefined) data.active = input.active;

    const updated = await tx.employee.update({ where: { id: input.employeeId }, data });
    await logAction(tx, {
      userId: input.userId,
      action: "EMPLOYEE_UPDATE",
      entityType: "Employee",
      entityId: input.employeeId,
      before: { name: existing.name, trade: existing.trade, wageType: existing.wageType, active: existing.active },
      after: { name: updated.name, trade: updated.trade, wageType: updated.wageType, active: updated.active },
    });
    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  Attendance
// ───────────────────────────────────────────────────────────

export interface LogAttendanceInput {
  companyId: string;
  employeeId: string;
  date: Date; // working day
  projectId?: string;
  checkIn?: Date;
  checkOut?: Date;
  hoursWorked?: Decimal | number | string;
  status: "PRESENT" | "ABSENT" | "HALF_DAY" | "OVERTIME" | "LEAVE";
  notes?: string;
  recordedById?: string;
  // GPS coordinates from mobile check-in/check-out
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  checkInLocation?: string;
  checkOutLocation?: string;
  userId?: string;
}

export async function recordAttendance(input: LogAttendanceInput) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
    });
    if (!employee) throw new HrError("Employee not found in this company", 404);
    if (!employee.active) throw new HrError("Employee is inactive", 400);

    if (input.projectId) {
      const proj = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      });
      if (!proj) throw new HrError("Project not found in this company", 404);
    }

    const dateOnly = startOfDay(input.date);

    // Upsert on [employeeId, date]
    const existing = await tx.workerAttendance.findUnique({
      where: { employeeId_date: { employeeId: input.employeeId, date: dateOnly } },
    });

    const data = {
      companyId: input.companyId,
      projectId: input.projectId ?? null,
      checkIn: input.checkIn ?? null,
      checkOut: input.checkOut ?? null,
      hoursWorked: input.hoursWorked != null ? new Decimal(input.hoursWorked) : null,
      status: input.status,
      notes: input.notes ?? null,
      recordedById: input.recordedById ?? null,
      checkInLat: input.checkInLat ?? null,
      checkInLng: input.checkInLng ?? null,
      checkOutLat: input.checkOutLat ?? null,
      checkOutLng: input.checkOutLng ?? null,
      checkInLocation: input.checkInLocation ?? null,
      checkOutLocation: input.checkOutLocation ?? null,
    };

    let record;
    if (existing) {
      record = await tx.workerAttendance.update({
        where: { id: existing.id },
        data,
      });
    } else {
      record = await tx.workerAttendance.create({
        data: { employeeId: input.employeeId, date: dateOnly, ...data },
      });
    }

    await logAction(tx, {
      userId: input.userId,
      action: "ATTENDANCE_LOG",
      entityType: "WorkerAttendance",
      entityId: record.id,
      after: { employeeId: input.employeeId, date: dateOnly.toISOString().slice(0, 10), status: input.status, hoursWorked: data.hoursWorked?.toString() ?? null },
    });
    return record;
  });
}

export interface BulkAttendanceRecord {
  employeeId: string;
  status: "PRESENT" | "ABSENT" | "HALF_DAY" | "OVERTIME" | "LEAVE";
  hoursWorked?: number;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  checkInLocation?: string;
  checkOutLocation?: string;
}

export interface BulkAttendanceInput {
  companyId: string;
  date: Date;
  projectId?: string;
  records: BulkAttendanceRecord[];
  recordedById?: string;
  userId?: string;
}

/** Log attendance for many workers on one day in a single transaction. */
export async function bulkRecordAttendance(input: BulkAttendanceInput) {
  const dateOnly = startOfDay(input.date);
  return prisma.$transaction(async (tx) => {
    const results: { employeeId: string; status: string }[] = [];
    for (const r of input.records) {
      const employee = await tx.employee.findFirst({
        where: { id: r.employeeId, companyId: input.companyId, deletedAt: null },
      });
      if (!employee) continue; // skip unknown workers in bulk mode

      const data = {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        checkIn: r.checkIn ? new Date(r.checkIn) : null,
        checkOut: r.checkOut ? new Date(r.checkOut) : null,
        hoursWorked: r.hoursWorked != null ? new Decimal(r.hoursWorked) : null,
        status: r.status,
        notes: r.notes ?? null,
        recordedById: input.recordedById ?? null,
        checkInLat: r.checkInLat ?? null,
        checkInLng: r.checkInLng ?? null,
        checkOutLat: r.checkOutLat ?? null,
        checkOutLng: r.checkOutLng ?? null,
        checkInLocation: r.checkInLocation ?? null,
        checkOutLocation: r.checkOutLocation ?? null,
      };

      const existing = await tx.workerAttendance.findUnique({
        where: { employeeId_date: { employeeId: r.employeeId, date: dateOnly } },
      });
      let record;
      if (existing) {
        record = await tx.workerAttendance.update({ where: { id: existing.id }, data });
      } else {
        record = await tx.workerAttendance.create({
          data: { employeeId: r.employeeId, date: dateOnly, ...data },
        });
      }
      results.push({ employeeId: r.employeeId, status: r.status });
    }

    await logAction(tx, {
      userId: input.userId,
      action: "ATTENDANCE_BULK_LOG",
      entityType: "WorkerAttendance",
      entityId: `${input.companyId}:${dateOnly.toISOString().slice(0, 10)}`,
      after: { date: dateOnly.toISOString().slice(0, 10), projectId: input.projectId ?? null, count: results.length },
    });
    return { count: results.length, date: dateOnly };
  });
}

// ───────────────────────────────────────────────────────────
//  Payroll
// ───────────────────────────────────────────────────────────

export interface GeneratePayrollInput {
  companyId: string;
  month: number; // 1-12
  year: number;
  userId?: string;
}

/**
 * Generate (or regenerate, if still DRAFT) a payroll period and its lines
 * from attendance records in the period. Lines are computed:
 *   daysWorked  = Σ attendance weights
 *   basicAmount = wage-type formula (see computeBasicAmount)
 *   overtime    = overtimeHours × hourlyRate × 1.5
 *   deductions  = 0 (editable via adjustPayrollLine before processing)
 *   netPay      = basic + overtime − deductions
 */
export async function generatePayroll(input: GeneratePayrollInput) {
  if (input.month < 1 || input.month > 12) throw new HrError("Month must be 1-12", 400);

  const { startDate, endDate } = monthRange(input.year, input.month);
  const workingDays = computeWorkingDays(startDate, endDate);

  return prisma.$transaction(async (tx) => {
    // Find or create the period.
    let period = await tx.payrollPeriod.findUnique({
      where: { companyId_year_month: { companyId: input.companyId, year: input.year, month: input.month } },
    });

    if (period && period.status !== "DRAFT") {
      throw new HrError(
        `Payroll for ${input.year}-${String(input.month).padStart(2, "0")} is already ${period.status}`,
        409,
      );
    }

    if (!period) {
      period = await tx.payrollPeriod.create({
        data: {
          companyId: input.companyId,
          month: input.month,
          year: input.year,
          startDate,
          endDate,
          status: "DRAFT",
        },
      });
    }

    // Regenerate lines: delete existing draft lines, recompute from attendance.
    await tx.payrollLine.deleteMany({ where: { payrollPeriodId: period.id } });

    const employees = await tx.employee.findMany({
      where: { companyId: input.companyId, deletedAt: null, active: true },
    });

    let totalGross = new Decimal(0);
    let totalOvertime = new Decimal(0);
    let totalDeductions = new Decimal(0);
    let totalNet = new Decimal(0);

    for (const emp of employees) {
      const attendances = await tx.workerAttendance.findMany({
        where: {
          employeeId: emp.id,
          date: { gte: startDate, lte: endDate },
        },
      });
      // Skip workers with no attendance in the period (nothing to pay).
      if (attendances.length === 0) continue;

      const daysWorked = computeDaysWorked(attendances);
      const basicAmount = computeBasicAmount(emp, daysWorked, workingDays);
      const otHours = computeOvertimeHours(attendances);
      const hr = hourlyRateFor(emp, workingDays);
      const overtimeAmount = otHours.times(hr).times(OVERTIME_MULTIPLIER);
      // New salary components — default to 0 on generation; editable via adjustPayrollLine.
      const allowance = new Decimal(0);
      const bonus = new Decimal(0);
      const pf = new Decimal(0);
      const tax = new Decimal(0);
      const deductions = new Decimal(0);
      const grossPay = computeGrossPay(basicAmount, overtimeAmount, allowance, bonus);
      const lineTotalDeductions = computeTotalDeductions(deductions, pf, tax);
      const netPay = computeNetPay(basicAmount, overtimeAmount, deductions, allowance, bonus, pf, tax);

      await tx.payrollLine.create({
        data: {
          payrollPeriodId: period.id,
          employeeId: emp.id,
          daysWorked,
          basicAmount,
          overtimeAmount,
          allowance,
          bonus,
          pf,
          tax,
          deductions,
          grossPay,
          totalDeductions: lineTotalDeductions,
          netPay,
        },
      });

      totalGross = totalGross.plus(basicAmount);
      totalOvertime = totalOvertime.plus(overtimeAmount);
      totalDeductions = totalDeductions.plus(deductions);
      totalNet = totalNet.plus(netPay);
    }

    const updated = await tx.payrollPeriod.update({
      where: { id: period.id },
      data: { totalGross, totalOvertime, totalDeductions, totalNet },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "PAYROLL_GENERATE",
      entityType: "PayrollPeriod",
      entityId: period.id,
      after: { month: input.month, year: input.year, employees: employees.length, totalNet: totalNet.toString() },
    });
    return updated;
  });
}

export interface AdjustPayrollLineInput {
  payrollLineId: string;
  overtimeAmount?: Decimal | number | string;
  allowance?: Decimal | number | string;
  bonus?: Decimal | number | string;
  pf?: Decimal | number | string;
  tax?: Decimal | number | string;
  deductions?: Decimal | number | string;
  userId?: string;
}

/** Manually adjust overtime/deductions on a draft payroll line. */
export async function updatePayrollLine(input: AdjustPayrollLineInput) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.payrollLine.findUnique({
      where: { id: input.payrollLineId },
      include: { payrollPeriod: true },
    });
    if (!line) throw new HrError("Payroll line not found", 404);
    if (line.payrollPeriod.status !== "DRAFT") {
      throw new HrError("Cannot adjust a payroll line after it is processed", 409);
    }

    const overtimeAmount =
      input.overtimeAmount !== undefined ? new Decimal(input.overtimeAmount) : line.overtimeAmount;
    const allowance =
      input.allowance !== undefined ? new Decimal(input.allowance) : line.allowance;
    const bonus =
      input.bonus !== undefined ? new Decimal(input.bonus) : line.bonus;
    const pf =
      input.pf !== undefined ? new Decimal(input.pf) : line.pf;
    const tax =
      input.tax !== undefined ? new Decimal(input.tax) : line.tax;
    const deductions =
      input.deductions !== undefined ? new Decimal(input.deductions) : line.deductions;
    const grossPay = computeGrossPay(line.basicAmount, overtimeAmount, allowance, bonus);
    const totalDeductions = computeTotalDeductions(deductions, pf, tax);
    const netPay = computeNetPay(line.basicAmount, overtimeAmount, deductions, allowance, bonus, pf, tax);

    const updated = await tx.payrollLine.update({
      where: { id: input.payrollLineId },
      data: { overtimeAmount, allowance, bonus, pf, tax, deductions, grossPay, totalDeductions, netPay },
    });

    // Recompute period totals from all lines.
    const allLines = await tx.payrollLine.findMany({
      where: { payrollPeriodId: line.payrollPeriodId },
    });
    const totals = allLines.reduce(
      (acc, l) => ({
        gross: acc.gross.plus(l.basicAmount),
        ot: acc.ot.plus(l.overtimeAmount),
        ded: acc.ded.plus(l.deductions),
        net: acc.net.plus(l.netPay),
      }),
      { gross: new Decimal(0), ot: new Decimal(0), ded: new Decimal(0), net: new Decimal(0) },
    );
    await tx.payrollPeriod.update({
      where: { id: line.payrollPeriodId },
      data: {
        totalGross: totals.gross,
        totalOvertime: totals.ot,
        totalDeductions: totals.ded,
        totalNet: totals.net,
      },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "PAYROLL_LINE_ADJUST",
      entityType: "PayrollLine",
      entityId: input.payrollLineId,
      before: { overtimeAmount: line.overtimeAmount.toString(), allowance: line.allowance.toString(), bonus: line.bonus.toString(), pf: line.pf.toString(), tax: line.tax.toString(), deductions: line.deductions.toString(), netPay: line.netPay.toString() },
      after: { overtimeAmount: overtimeAmount.toString(), allowance: allowance.toString(), bonus: bonus.toString(), pf: pf.toString(), tax: tax.toString(), deductions: deductions.toString(), netPay: netPay.toString() },
    });
    return updated;
  });
}

/** Lock a DRAFT payroll and post the salary expense to the GL. */
export async function processPayroll(input: { payrollPeriodId: string; userId?: string }) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findUnique({
      where: { id: input.payrollPeriodId },
      include: { lines: { include: { employee: { select: { activeProjectId: true } } } } },
    });
    if (!period) throw new HrError("Payroll period not found", 404);
    if (period.status !== "DRAFT") {
      throw new HrError(`Payroll is already ${period.status}`, 409);
    }
    if (period.lines.length === 0) {
      throw new HrError("Cannot process a payroll with no lines — generate first", 400);
    }

    // Post the GL entry inside the same transaction.
    await postPayroll(tx, {
      companyId: period.companyId,
      payrollPeriodId: period.id,
      totalNet: period.totalNet,
      postedById: input.userId,
    });

    // Allocate labor costs to projects — group payroll lines by the employee's
    // activeProjectId and create a ProjectCost(LABOUR) record for each project.
    // This connects the HR payroll flow to the asset-value pipeline: the
    // ProjectCost records are picked up by reallocateProjectCosts() which
    // updates BuiltUnit.productionCost. We create the ProjectCost records
    // directly (without calling addProjectCost) to avoid double GL posting —
    // the payroll GL entry already records the salary expense + payable.
    const projectLabour = new Map<string, Decimal>();
    for (const line of period.lines) {
      const projectId = line.employee?.activeProjectId;
      if (!projectId) continue;
      const grossPay = new Decimal(line.grossPay);
      if (grossPay.lte(0)) continue;
      projectLabour.set(projectId, (projectLabour.get(projectId) ?? new Decimal(0)).plus(grossPay));
    }

    for (const [projectId, amount] of projectLabour) {
      await tx.projectCost.create({
        data: {
          projectId,
          costType: "LABOUR",
          amount,
          date: new Date(),
          notes: `Auto-allocated from payroll ${period.month}/${period.year}`,
          createdById: input.userId,
        },
      });
      await reallocateProjectCosts(tx, projectId);
    }

    const updated = await tx.payrollPeriod.update({
      where: { id: input.payrollPeriodId },
      data: {
        status: "PROCESSED",
        processedById: input.userId ?? null,
        processedAt: new Date(),
      },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "PAYROLL_PROCESS",
      entityType: "PayrollPeriod",
      entityId: input.payrollPeriodId,
      before: { status: "DRAFT" },
      after: { status: "PROCESSED", totalNet: period.totalNet.toString(), lines: period.lines.length, projectsAllocated: projectLabour.size },
    });
    return updated;
  });
}

/** Settle a PROCESSED payroll (pay it) and clear the Salaries Payable liability. */
export async function payPayroll(input: { payrollPeriodId: string; userId?: string }) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findUnique({ where: { id: input.payrollPeriodId } });
    if (!period) throw new HrError("Payroll period not found", 404);
    if (period.status !== "PROCESSED") {
      throw new HrError(`Payroll must be PROCESSED before paying (current: ${period.status})`, 409);
    }

    await postPayrollPayment(tx, {
      companyId: period.companyId,
      payrollPeriodId: period.id,
      totalNet: period.totalNet,
      postedById: input.userId,
    });

    const updated = await tx.payrollPeriod.update({
      where: { id: input.payrollPeriodId },
      data: { status: "PAID", paidAt: new Date() },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "PAYROLL_PAID",
      entityType: "PayrollPeriod",
      entityId: input.payrollPeriodId,
      before: { status: "PROCESSED" },
      after: { status: "PAID", totalNet: period.totalNet.toString() },
    });
    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  Daily Progress Reports (DPR)
// ───────────────────────────────────────────────────────────

export interface DprMaterialLineInput {
  materialId: string;
  qty: Decimal | number | string;
  unitCost: Decimal | number | string;
}

export interface DprLaborLineInput {
  employeeId?: string;
  crewId?: string;
  hoursWorked: Decimal | number | string;
  taskDescription: string;
}

export interface SubmitDprInput {
  companyId: string;
  projectId: string;
  date: Date;
  submittedById?: string;
  weather?: string;
  workSummary: string;
  workType?: string; // for benchmark comparison + auto-scrap detection
  workQty?: Decimal | number | string | null; // quantity of work done (e.g. 500 sqft of foundation)
  workUnit?: string | null; // unit of work (e.g. "sqft", "cubic meter")
  progressPct?: Decimal | number | string;
  blockers?: string;
  tomorrowPlan?: string;
  notes?: string;
  materialLines?: DprMaterialLineInput[];
  laborLines?: DprLaborLineInput[];
  userId?: string;
}

/**
 * Submit (or update) a DPR for a project on a given day. Upserts on
 * [projectId, date]. Material lines are informational — they do NOT issue
 * stock (use the MaterialIssue flow for actual consumption).
 */
export async function submitDPR(input: SubmitDprInput) {
  const dpr = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
    });
    if (!project) throw new HrError("Project not found in this company", 404);

    const dateOnly = startOfDay(input.date);
    const progressPct = input.progressPct != null ? new Decimal(input.progressPct) : new Decimal(0);

    const headerData = {
      weather: input.weather ?? null,
      workSummary: input.workSummary,
      workType: input.workType ?? null,
      workQty: input.workQty != null ? new Decimal(input.workQty) : null,
      workUnit: input.workUnit ?? null,
      progressPct,
      blockers: input.blockers ?? null,
      tomorrowPlan: input.tomorrowPlan ?? null,
      notes: input.notes ?? null,
      submittedById: input.submittedById ?? null,
    };

    const existing = await tx.dailyProgressReport.findUnique({
      where: { projectId_date: { projectId: input.projectId, date: dateOnly } },
      include: { materialLines: true, laborLines: true },
    });

    let dpr;
    if (existing) {
      // Replace child lines.
      await tx.dPRMaterialLine.deleteMany({ where: { dprId: existing.id } });
      await tx.dPRLaborLine.deleteMany({ where: { dprId: existing.id } });
      dpr = await tx.dailyProgressReport.update({
        where: { id: existing.id },
        data: headerData,
      });
    } else {
      dpr = await tx.dailyProgressReport.create({
        data: {
          companyId: input.companyId,
          projectId: input.projectId,
          date: dateOnly,
          ...headerData,
        },
      });
    }

    if (input.materialLines?.length) {
      await tx.dPRMaterialLine.createMany({
        data: input.materialLines.map((l) => ({
          dprId: dpr.id,
          materialId: l.materialId,
          qty: new Decimal(l.qty),
          unitCost: new Decimal(l.unitCost),
        })),
      });
    }
    if (input.laborLines?.length) {
      await tx.dPRLaborLine.createMany({
        data: input.laborLines.map((l) => ({
          dprId: dpr.id,
          employeeId: l.employeeId ?? null,
          crewId: l.crewId ?? null,
          hoursWorked: new Decimal(l.hoursWorked),
          taskDescription: l.taskDescription,
        })),
      });
    }

    await logAction(tx, {
      userId: input.userId,
      action: existing ? "DPR_UPDATE" : "DPR_SUBMIT",
      entityType: "DailyProgressReport",
      entityId: dpr.id,
      after: { projectId: input.projectId, date: dateOnly.toISOString().slice(0, 10), progressPct: progressPct.toString(), materialLines: input.materialLines?.length ?? 0, laborLines: input.laborLines?.length ?? 0 },
    });
    return dpr;
  });

  // Auto-run variance analysis if a workType is set and material lines exist.
  // This stores the variance results on the DPR so over-consumption is visible
  // immediately. Auto-scrap generation remains a separate manual action
  // (the system prompts the manager — see POST /api/dprs/[id]/variance).
  if (input.workType && input.materialLines?.length) {
    try {
      await runDprVarianceAnalysis(dpr.id);
    } catch {
      // Variance analysis is best-effort — don't fail the DPR submission
    }
  }

  return dpr;
}

// Aliases used by callers that distinguish create vs update semantics.
// submitDPR upserts on [projectId, date], so both resolve to the same op.
export const createDpr = submitDPR;
export const updateDpr = submitDPR;

/** Delete a DPR and its child lines, with audit logging. */
export async function deleteDpr(dprId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const dpr = await tx.dailyProgressReport.findUnique({
      where: { id: dprId },
      include: { _count: { select: { materialLines: true, laborLines: true } } },
    });
    if (!dpr) throw new HrError("DPR not found", 404);
    await tx.dPRMaterialLine.deleteMany({ where: { dprId } });
    await tx.dPRLaborLine.deleteMany({ where: { dprId } });
    await tx.dailyProgressReport.delete({ where: { id: dprId } });
    await logAction(tx, {
      userId,
      action: "DPR_DELETE",
      entityType: "DailyProgressReport",
      entityId: dprId,
      before: { date: dpr.date.toISOString().slice(0, 10), projectId: dpr.projectId, progressPct: dpr.progressPct.toString() },
    });
    return { deleted: true };
  });
}

// ── DPR Multi-Tier Approval ───────────────────────────────
// SRS transcript: Sub-Admins (MANAGER) approve DPRs before final
// Admin (OWNER/ADMIN) approval. Flow:
//   SUBMITTED → SUB_ADMIN_APPROVED → APPROVED
//   (any pre-final stage can be REJECTED)

export async function subAdminApproveDpr(dprId: string, approverId: string, notes?: string) {
  return prisma.$transaction(async (tx) => {
    const dpr = await tx.dailyProgressReport.findUnique({ where: { id: dprId } });
    if (!dpr) throw new HrError("DPR not found", 404);
    if (dpr.approvalStatus !== "SUBMITTED") {
      throw new HrError(`DPR must be in SUBMITTED status to approve (current: ${dpr.approvalStatus})`, 409);
    }
    const updated = await tx.dailyProgressReport.update({
      where: { id: dprId },
      data: {
        approvalStatus: "SUB_ADMIN_APPROVED",
        subAdminApprovedById: approverId,
        subAdminApprovedAt: new Date(),
        approvalNotes: notes ?? null,
      },
    });
    await logAction(tx, {
      userId: approverId,
      action: "DPR_SUB_ADMIN_APPROVE",
      entityType: "DailyProgressReport",
      entityId: dprId,
      after: { approvalStatus: "SUB_ADMIN_APPROVED", notes: notes ?? null },
    });
    return updated;
  });
}

export async function adminApproveDpr(dprId: string, approverId: string, notes?: string) {
  return prisma.$transaction(async (tx) => {
    const dpr = await tx.dailyProgressReport.findUnique({ where: { id: dprId } });
    if (!dpr) throw new HrError("DPR not found", 404);
    if (dpr.approvalStatus !== "SUB_ADMIN_APPROVED") {
      throw new HrError(`DPR must be Sub-Admin approved first (current: ${dpr.approvalStatus})`, 409);
    }
    const updated = await tx.dailyProgressReport.update({
      where: { id: dprId },
      data: {
        approvalStatus: "APPROVED",
        adminApprovedById: approverId,
        adminApprovedAt: new Date(),
        approvalNotes: notes ?? null,
      },
    });
    await logAction(tx, {
      userId: approverId,
      action: "DPR_ADMIN_APPROVE",
      entityType: "DailyProgressReport",
      entityId: dprId,
      after: { approvalStatus: "APPROVED", notes: notes ?? null },
    });
    return updated;
  });
}

export async function rejectDpr(dprId: string, rejecterId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const dpr = await tx.dailyProgressReport.findUnique({ where: { id: dprId } });
    if (!dpr) throw new HrError("DPR not found", 404);
    if (dpr.approvalStatus === "APPROVED") {
      throw new HrError("Cannot reject an already-approved DPR", 409);
    }
    const previousStatus = dpr.approvalStatus;
    const updated = await tx.dailyProgressReport.update({
      where: { id: dprId },
      data: {
        approvalStatus: "REJECTED",
        approvalNotes: reason,
      },
    });
    await logAction(tx, {
      userId: rejecterId,
      action: "DPR_REJECT",
      entityType: "DailyProgressReport",
      entityId: dprId,
      before: { approvalStatus: previousStatus },
      after: { approvalStatus: "REJECTED", reason },
    });
    return updated;
  });
}

/** Reset a rejected DPR back to SUBMITTED so it can be re-approved. */
export async function resubmitDpr(dprId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const dpr = await tx.dailyProgressReport.findUnique({ where: { id: dprId } });
    if (!dpr) throw new HrError("DPR not found", 404);
    if (dpr.approvalStatus !== "REJECTED") {
      throw new HrError("Only rejected DPRs can be resubmitted", 409);
    }
    const updated = await tx.dailyProgressReport.update({
      where: { id: dprId },
      data: {
        approvalStatus: "SUBMITTED",
        subAdminApprovedById: null,
        subAdminApprovedAt: null,
        adminApprovedById: null,
        adminApprovedAt: null,
        approvalNotes: null,
      },
    });
    await logAction(tx, {
      userId,
      action: "DPR_RESUBMIT",
      entityType: "DailyProgressReport",
      entityId: dprId,
      before: { approvalStatus: "REJECTED" },
      after: { approvalStatus: "SUBMITTED" },
    });
    return updated;
  });
}

/** Delete an attendance record, with audit logging. */
export async function deleteAttendance(attendanceId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.workerAttendance.findUnique({ where: { id: attendanceId } });
    if (!record) throw new HrError("Attendance record not found", 404);
    await tx.workerAttendance.delete({ where: { id: attendanceId } });
    await logAction(tx, {
      userId,
      action: "ATTENDANCE_DELETE",
      entityType: "WorkerAttendance",
      entityId: attendanceId,
      before: { employeeId: record.employeeId, date: record.date.toISOString().slice(0, 10), status: record.status },
    });
    return { deleted: true };
  });
}

/**
 * Attendance summary for a date range — counts by status + attendance rate.
 * Powers the HR dashboard tiles.
 */
export async function attendanceSummary(opts: {
  companyId: string;
  projectId?: string;
  from: Date;
  to: Date;
}) {
  return workforceProductivity(opts);
}

/**
 * DPR analysis for a project — progress-over-time + labour/material totals.
 * Powers the comparative-analysis (planned vs actual) view.
 */
export async function dprAnalysis(projectId: string) {
  const dprs = await prisma.dailyProgressReport.findMany({
    where: { projectId },
    orderBy: { date: "asc" },
    include: {
      _count: { select: { materialLines: true, laborLines: true } },
      laborLines: { select: { hoursWorked: true } },
    },
  });

  const history = dprs.map((d) => ({
    id: d.id,
    date: d.date,
    progressPct: new Decimal(d.progressPct).toNumber(),
    workSummary: d.workSummary,
    laborHours: d.laborLines.reduce(
      (s, l) => s.plus(new Decimal(l.hoursWorked)),
      new Decimal(0),
    ).toNumber(),
    materialLineCount: d._count.materialLines,
  }));

  const totalLaborHours = history.reduce((s, h) => s + h.laborHours, 0);
  const latest = history[history.length - 1]?.progressPct ?? 0;
  const first = history[0]?.progressPct ?? 0;

  return {
    dprCount: dprs.length,
    totalLaborHours,
    latestProgressPct: latest,
    progressDelta: latest - first,
    history,
  };
}

// ───────────────────────────────────────────────────────────
//  Reporting / comparative analysis
// ───────────────────────────────────────────────────────────

/** DPR history for a project — progress % over time (planned-vs-actual input). */
export async function projectProgressHistory(projectId: string) {
  const dprs = await prisma.dailyProgressReport.findMany({
    where: { projectId },
    orderBy: { date: "asc" },
    select: { id: true, date: true, progressPct: true, workSummary: true, submittedById: true },
  });
  return dprs.map((d) => ({
    id: d.id,
    date: d.date,
    progressPct: new Decimal(d.progressPct).toNumber(),
    workSummary: d.workSummary,
  }));
}

/** Workforce productivity: labour hours + attendance summary for a date range. */
export async function workforceProductivity(opts: {
  companyId: string;
  projectId?: string;
  from: Date;
  to: Date;
}) {
  const attendances = await prisma.workerAttendance.findMany({
    where: {
      companyId: opts.companyId,
      date: { gte: startOfDay(opts.from), lte: endOfDay(opts.to) },
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    },
    include: { employee: { select: { id: true, name: true, trade: true } } },
  });

  const totalHours = attendances.reduce(
    (s, a) => s.plus(a.hoursWorked ? new Decimal(a.hoursWorked) : new Decimal(0)),
    new Decimal(0),
  );
  const present = attendances.filter((a) => a.status === "PRESENT" || a.status === "OVERTIME").length;
  const halfDays = attendances.filter((a) => a.status === "HALF_DAY").length;
  const absent = attendances.filter((a) => a.status === "ABSENT").length;
  const leave = attendances.filter((a) => a.status === "LEAVE").length;

  return {
    totalRecords: attendances.length,
    totalHours: totalHours.toNumber(),
    present,
    halfDays,
    absent,
    leave,
    attendanceRate: attendances.length > 0
      ? ((present + halfDays * 0.5) / attendances.length) * 100
      : 0,
  };
}

/** Yearly payroll summary — net pay per month. */
export async function payrollSummary(companyId: string, year: number) {
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId, year },
    orderBy: { month: "asc" },
    select: { month: true, status: true, totalGross: true, totalOvertime: true, totalDeductions: true, totalNet: true },
  });
  return periods.map((p) => ({
    month: p.month,
    status: p.status,
    totalGross: new Decimal(p.totalGross).toNumber(),
    totalOvertime: new Decimal(p.totalOvertime).toNumber(),
    totalDeductions: new Decimal(p.totalDeductions).toNumber(),
    totalNet: new Decimal(p.totalNet).toNumber(),
  }));
}

// ───────────────────────────────────────────────────────────
//  Date helpers
// ───────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function monthRange(year: number, month: number): { startDate: Date; endDate: Date } {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999); // day 0 of next month = last day of this month
  return { startDate, endDate };
}

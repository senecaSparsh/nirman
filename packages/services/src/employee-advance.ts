// ─────────────────────────────────────────────────────────────
//  EmployeeAdvance — salary advances & loans with scheduled
//  payroll recovery.
//
//  The business shape (construction-industry reality): workers
//  take cash advances constantly. This module keeps a ledger —
//  issue an advance with a monthly recovery amount, and every
//  PAID payroll line auto-carries a deduction component until the
//  advance is settled.
//
//  Invariants:
//   - recoveredAmount only increments when a payroll line is PAID
//     (draft regeneration can never double-count).
//   - A deduction is never larger than the outstanding balance.
//   - status moves ACTIVE → SETTLED automatically on full recovery;
//     PAUSED skips deduction; CANCELLED writes the advance off.
// ─────────────────────────────────────────────────────────────

import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { HrError } from "./hr";
import { withSerializableTransaction } from "./transaction";

export type AdvanceStatus = "ACTIVE" | "PAUSED" | "SETTLED" | "CANCELLED";

export interface IssueAdvanceInput {
  employeeId: string;
  companyId: string;
  amount: number;
  monthlyRecovery: number;
  notes?: string | null;
  actorUserId: string;
}

/** Issue a salary advance to an employee. */
export async function issueAdvance(input: IssueAdvanceInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new HrError("Advance amount must be greater than 0", 400);
  }
  if (!Number.isFinite(input.monthlyRecovery) || input.monthlyRecovery <= 0) {
    throw new HrError("Monthly recovery must be greater than 0", 400);
  }
  if (input.monthlyRecovery > input.amount) {
    throw new HrError("Monthly recovery cannot exceed the advance amount", 400);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
    select: { id: true, active: true, name: true },
  });
  if (!employee) throw new HrError("Employee not found in this company", 404);
  if (!employee.active) throw new HrError("Cannot issue an advance to an inactive employee", 400);

  const advance = await prisma.employeeAdvance.create({
    data: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      amount: input.amount,
      monthlyRecovery: input.monthlyRecovery,
      notes: input.notes ?? null,
      issuedById: input.actorUserId,
    },
  });
  await logAction(prisma, {
    userId: input.actorUserId,
    companyId: input.companyId,
    action: "ADVANCE_ISSUE",
    entityType: "EmployeeAdvance",
    entityId: advance.id,
    after: { employeeId: input.employeeId, amount: input.amount, monthlyRecovery: input.monthlyRecovery },
  });
  return advance;
}

/** Advances for one employee (dossier view). */
export async function listEmployeeAdvances(employeeId: string, companyId: string) {
  return prisma.employeeAdvance.findMany({
    where: { employeeId, companyId },
    orderBy: { createdAt: "desc" },
    include: { issuedBy: { select: { name: true } } },
  });
}

/** Advances across a company (HR books view) — scoped by caller via employeeIds. */
export async function listCompanyAdvances(companyId: string, employeeIds?: string[]) {
  return prisma.employeeAdvance.findMany({
    where: {
      companyId,
      status: { not: "CANCELLED" },
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      employee: { select: { id: true, name: true, designation: true } },
      issuedBy: { select: { name: true } },
    },
  });
}

/** Pause / resume / settle / cancel an advance. */
export async function updateAdvanceStatus(
  advanceId: string,
  companyId: string,
  status: AdvanceStatus,
  actorUserId: string,
  settleNote?: string,
) {
  const advance = await prisma.employeeAdvance.findFirst({
    where: { id: advanceId, companyId },
  });
  if (!advance) throw new HrError("Advance not found", 404);
  if (advance.status === "SETTLED" || advance.status === "CANCELLED") {
    throw new HrError(`Cannot change a ${advance.status.toLowerCase()} advance`, 400);
  }
  if (status === "SETTLED" && advance.status !== "ACTIVE" && advance.status !== "PAUSED") {
    throw new HrError("Invalid status transition", 400);
  }
  return withSerializableTransaction(async (tx) => {
    const updated = await tx.employeeAdvance.update({
      where: { id: advance.id },
      data: {
        status,
        // SETTLED means the debt is closed (cash repaid / waived — the
        // settleNote records which). recoveredAmount must equal the amount
        // or outstanding-balance reports keep showing phantom debt forever.
        ...(status === "SETTLED" ? { recoveredAmount: advance.amount } : {}),
        notes: settleNote ? `${advance.notes ?? ""}\n${settleNote}`.trim() : advance.notes,
      },
    });
    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: `ADVANCE_${status}`,
      entityType: "EmployeeAdvance",
      entityId: advance.id,
      before: { status: advance.status },
      after: { status },
    });
    return updated;
  });
}

/**
 * Active advance deductions for a set of employees — called by
 * generatePayroll so each draft line carries its recovery component.
 * Returns employeeId → component inputs (one row per active advance,
 * capped at the outstanding balance).
 */
export async function advanceDeductionsForPayroll(
  companyId: string,
  employeeIds: string[],
): Promise<Map<string, { advanceId: string; amount: number; label: string }[]>> {
  const map = new Map<string, { advanceId: string; amount: number; label: string }[]>();
  if (employeeIds.length === 0) return map;
  const advances = await prisma.employeeAdvance.findMany({
    where: { companyId, employeeId: { in: employeeIds }, status: "ACTIVE" },
    select: { id: true, employeeId: true, amount: true, recoveredAmount: true, monthlyRecovery: true },
  });
  for (const a of advances) {
    const outstanding = a.amount.minus(a.recoveredAmount);
    if (outstanding.lte(0)) continue;
    const deduction = a.monthlyRecovery.gt(outstanding) ? outstanding : a.monthlyRecovery;
    const list = map.get(a.employeeId) ?? [];
    list.push({ advanceId: a.id, amount: deduction.toNumber(), label: "Advance recovery" });
    map.set(a.employeeId, list);
  }
  return map;
}

/**
 * Credit recoveries when payroll lines are marked PAID — walks the
 * advanceId-linked components on paid lines, increments recoveredAmount,
 * and auto-settles fully recovered advances. Called by the payroll pay path.
 */
export async function creditAdvanceRecoveries(
  tx: Prisma.TransactionClient,
  payrollLineIds: string[],
  actorUserId: string | undefined,
  companyId: string,
): Promise<number> {
  const components = await tx.payrollLineComponent.findMany({
    where: { payrollLineId: { in: payrollLineIds }, advanceId: { not: null } },
    select: { id: true, advanceId: true, amount: true },
  });
  let credited = 0;
  for (const c of components) {
    if (!c.advanceId) continue;
    const updated = await tx.employeeAdvance.updateMany({
      where: { id: c.advanceId, status: "ACTIVE" },
      data: { recoveredAmount: { increment: c.amount } },
    });
    if (updated.count === 0) continue;
    credited++;
    // Auto-settle when fully recovered.
    const adv = await tx.employeeAdvance.findUnique({
      where: { id: c.advanceId },
      select: { amount: true, recoveredAmount: true },
    });
    if (adv && adv.recoveredAmount.gte(adv.amount)) {
      await tx.employeeAdvance.update({
        where: { id: c.advanceId },
        data: { status: "SETTLED" },
      });
    }
  }
  if (credited > 0) {
    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "ADVANCE_RECOVERY_CREDIT",
      entityType: "PayrollLine",
      entityId: payrollLineIds[0] ?? "",
      after: { recoveredComponents: credited },
    });
  }
  return credited;
}

import { prisma, type Prisma, type LeaveType, type LeaveStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Leave Service — leave requests with approval workflow.
 *
 * Lifecycle: PENDING → APPROVED | REJECTED  (CANCELLED by requester before approval)
 * Invariants:
 *  - Employee must exist + belong to the company
 *  - endDate >= startDate
 *  - days = working days inclusive (computed; weekends excluded for EARNED/SICK/CASUAL)
 *  - Approver must have HR_MANAGE permission (enforced at API layer)
 */

function computeLeaveDays(start: Date, end: Date): Decimal {
  if (end < start) return new Decimal(0);
  let count = new Decimal(0);
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    const dow = cur.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count = count.plus(1);
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export interface CreateLeaveInput {
  companyId: string;
  employeeId: string;
  type?: LeaveType;
  startDate: string | Date;
  endDate: string | Date;
  reason?: string;
  userId?: string;
}

export async function createLeaveRequest(input: CreateLeaveInput) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
    });
    if (!employee) throw new ServiceError("Employee not found in this company", 404);

    const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
    const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ServiceError("Invalid start or end date");
    }
    // Zero out time for date-only comparison
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    if (e < s) throw new ServiceError("End date cannot be before start date");

    const days = computeLeaveDays(s, e);

    const leave = await tx.leaveRequest.create({
      data: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        type: input.type ?? "CASUAL",
        startDate: s,
        endDate: e,
        days,
        reason: input.reason ?? null,
        status: "PENDING",
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "LEAVE_REQUEST_CREATE",
        entityType: "LeaveRequest",
        entityId: leave.id,
        after: { employeeId: leave.employeeId, type: leave.type, days: leave.days.toString(), status: leave.status },
      });
    }

    return leave;
  });
}

export interface ApproveLeaveInput {
  leaveId: string;
  companyId: string;
  approvedById: string;
  approve: boolean; // true = APPROVED, false = REJECTED
  rejectedReason?: string;
}

export async function approveLeaveRequest(input: ApproveLeaveInput) {
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findFirst({
      where: { id: input.leaveId, companyId: input.companyId },
    });
    if (!leave) throw new ServiceError("Leave request not found", 404);
    if (leave.status !== "PENDING") {
      throw new ServiceError(`Cannot ${input.approve ? "approve" : "reject"} a leave in status ${leave.status}`);
    }

    const updated = await tx.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        approvedById: input.approvedById,
        approvedAt: new Date(),
        rejectedReason: input.approve ? null : (input.rejectedReason ?? null),
      },
    });

    await logAction(tx, {
      userId: input.approvedById,
      action: input.approve ? "LEAVE_REQUEST_APPROVE" : "LEAVE_REQUEST_REJECT",
      entityType: "LeaveRequest",
      entityId: leave.id,
      before: { status: leave.status },
      after: { status: updated.status, rejectedReason: updated.rejectedReason },
    });

    return updated;
  });
}

export async function cancelLeaveRequest(leaveId: string, companyId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findFirst({
      where: { id: leaveId, companyId },
    });
    if (!leave) throw new ServiceError("Leave request not found", 404);
    if (leave.status !== "PENDING") {
      throw new ServiceError(`Cannot cancel a leave in status ${leave.status}`);
    }
    const updated = await tx.leaveRequest.update({
      where: { id: leave.id },
      data: { status: "CANCELLED" },
    });
    if (userId) {
      await logAction(tx, {
        userId,
        action: "LEAVE_REQUEST_CANCEL",
        entityType: "LeaveRequest",
        entityId: leave.id,
        before: { status: leave.status },
        after: { status: "CANCELLED" },
      });
    }
    return updated;
  });
}

/** Leave balance summary for an employee in a calendar year. */
export async function leaveBalance(employeeId: string, year: number) {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
    select: { type: true, days: true },
  });
  const used: Record<string, number> = {};
  for (const r of requests) {
    const t = r.type as string;
    used[t] = (used[t] ?? 0) + Number(r.days);
  }
  return used;
}

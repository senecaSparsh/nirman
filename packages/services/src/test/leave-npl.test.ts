/**
 * Integration test for the rejected leave NPL fix.
 *
 * Bug: approveLeaveRequest with status REJECTED only updated the leave
 *   request status — it did NOT create WorkerAttendance rows for the
 *   absent days. This meant rejected leave days had no attendance record,
 *   so payroll neither paid nor docked them, creating a silent gap.
 *
 * Fix: when rejecting, auto-create NON_PAID_LEAVE attendance rows for
 *   each working day in the leave range, so payroll correctly treats
 *   those days as unpaid.
 *
 * Also verifies that approval still creates the correct attendance rows
 * (PAID_LEAVE for paid types, NON_PAID_LEAVE for UNPAID type).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture } from "./setup";

describe("Rejected leave NPL fix — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    return fixture;
  }

  /** Create an employee for testing. */
  async function createEmployee(companyId: string, name = "Test Worker") {
    return prisma.employee.create({
      data: {
        name,
        phone: "9999999999",
        companyId,
        wageType: "DAILY",
        dailyRate: new Decimal(500),
        active: true,
      },
    });
  }

  /** Create a pending leave request for the given date range.
   *  Uses Date.UTC construction so @db.Date stores the correct calendar date
   *  regardless of the test runner's timezone. The leave service reads back
   *  @db.Date as UTC-midnight and uses getFullYear/getMonth/getDate (which
   *  return the correct day in any timezone >= UTC-12), so this aligns.
   */
  async function createLeaveRequest(
    companyId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
    type: "CASUAL" | "SICK" | "EARNED" | "UNPAID" = "CASUAL",
  ) {
    // Parse YYYY-MM-DD and construct at UTC midnight
    const [sy, sm, sd] = startDate.split("-").map(Number) as [number, number, number];
    const [ey, em, ed] = endDate.split("-").map(Number) as [number, number, number];
    const start = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    // Compute working days (Mon-Fri) using UTC day
    let days = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) days++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return prisma.leaveRequest.create({
      data: {
        companyId,
        employeeId,
        type,
        startDate: start,
        endDate: end,
        days: new Decimal(days),
        reason: "Test leave",
        status: "PENDING",
      },
    });
  }

  // ── Rejected leave creates NPL attendance ──

  it("rejected leave creates NON_PAID_LEAVE attendance for each working day", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    // Sep 7-11, 2026 = Mon-Fri (5 working days)
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-11");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "Not enough balance",
    });

    const attendance = await prisma.workerAttendance.findMany({
      where: { employeeId: employee.id },
      orderBy: { date: "asc" },
    });

    expect(attendance).toHaveLength(5);
    for (const record of attendance) {
      expect(record.status).toBe("NON_PAID_LEAVE");
      expect(record.hoursWorked?.toNumber()).toBe(0);
    }
  });

  it("rejected leave skips weekends when creating NPL attendance", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    // Sep 7-13, 2026 = Mon-Sun (5 working days, Sat+Sun excluded)
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-13");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "Denied",
    });

    const attendance = await prisma.workerAttendance.findMany({
      where: { employeeId: employee.id },
      orderBy: { date: "asc" },
    });

    // 5 working days (Mon-Fri), Sat+Sun excluded
    expect(attendance).toHaveLength(5);
    // Verify all dates are weekdays (not Sunday=0, not Saturday=6)
    for (const record of attendance) {
      const dow = record.date.getUTCDay();
      expect(dow).not.toBe(0); // not Sunday
      expect(dow).not.toBe(6); // not Saturday
    }
  });

  it("rejected leave updates leave status to REJECTED with reason", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-09");

    const { approveLeaveRequest } = await import("../leave");
    const result = await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "Peak work period",
    });

    expect(result.status).toBe("REJECTED");
    expect(result.rejectedReason).toBe("Peak work period");
    expect(result.approvedById).toBe(user.id);
  });

  // ── Approved leave still works correctly ──

  it("approved CASUAL leave creates PAID_LEAVE attendance", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-09", "CASUAL");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: true,
      approvedById: user.id,
    });

    const attendance = await prisma.workerAttendance.findMany({
      where: { employeeId: employee.id },
    });

    expect(attendance).toHaveLength(3); // Mon-Wed
    for (const record of attendance) {
      expect(record.status).toBe("PAID_LEAVE");
    }
  });

  it("approved UNPAID leave creates NON_PAID_LEAVE attendance", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-09", "UNPAID");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: true,
      approvedById: user.id,
    });

    const attendance = await prisma.workerAttendance.findMany({
      where: { employeeId: employee.id },
    });

    expect(attendance).toHaveLength(3);
    for (const record of attendance) {
      expect(record.status).toBe("NON_PAID_LEAVE");
    }
  });

  // ── Edge cases ──

  it("rejected leave for a single day creates one NPL record", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    // Sep 7, 2026 = Monday (1 working day)
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-07");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "Denied",
    });

    const attendance = await prisma.workerAttendance.findMany({
      where: { employeeId: employee.id },
    });

    expect(attendance).toHaveLength(1);
    expect(attendance[0]!.status).toBe("NON_PAID_LEAVE");
  });

  it("rejected leave for a weekend creates no attendance records", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    // Sep 12-13, 2026 = Sat-Sun (0 working days)
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-12", "2026-09-13");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "Denied",
    });

    const attendance = await prisma.workerAttendance.findMany({
      where: { employeeId: employee.id },
    });

    expect(attendance).toHaveLength(0);
  });

  it("cannot reject an already-rejected leave", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-09");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "First rejection",
    });

    // Second rejection should fail
    await expect(
      approveLeaveRequest({
        leaveId: leave.id,
        companyId: company.id,
        approve: false,
        approvedById: user.id,
        rejectedReason: "Second rejection",
      }),
    ).rejects.toThrow("Cannot reject a leave in status REJECTED");
  });

  it("NPL attendance from rejected leave has notes referencing the leave", async () => {
    const { company, user } = await setup();
    const employee = await createEmployee(company.id);
    const leave = await createLeaveRequest(company.id, employee.id, "2026-09-07", "2026-09-07");

    const { approveLeaveRequest } = await import("../leave");
    await approveLeaveRequest({
      leaveId: leave.id,
      companyId: company.id,
      approve: false,
      approvedById: user.id,
      rejectedReason: "Denied",
    });

    const attendance = await prisma.workerAttendance.findFirst({
      where: { employeeId: employee.id },
    });

    expect(attendance).not.toBeNull();
    expect(attendance!.notes).toContain("rejected");
    expect(attendance!.notes).toContain(leave.id);
  });
});

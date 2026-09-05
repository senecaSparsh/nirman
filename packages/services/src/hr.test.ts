/**
 * Unit tests for the pure payroll/attendance helpers in hr.ts.
 *
 *   attendanceWeight          — weight of a status toward "days worked"
 *   computeDaysWorked         — sum present-days from attendance records
 *   computeOvertimeHours      — Σ max(0, hoursWorked − 8) for attended days
 *   computeStatusFromHours    — classify attendance from hours worked (85% rule)
 *   countLateDays             — count LATE entries
 *   computeLateHalfDayDeductions — 4 lates → 1 half-day deducted
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  attendanceWeight,
  computeDaysWorked,
  computeOvertimeHours,
  computeStatusFromHours,
  countLateDays,
  computeLateHalfDayDeductions,
} from "./hr";
import Decimal from "decimal.js";

describe("attendanceWeight", () => {
  it("returns 1 for PRESENT", () => {
    expect(attendanceWeight("PRESENT")).toBe(1);
  });

  it("returns 1 for OVERTIME", () => {
    expect(attendanceWeight("OVERTIME")).toBe(1);
  });

  it("returns 1 for LATE (late counts as full day)", () => {
    expect(attendanceWeight("LATE")).toBe(1);
  });

  it("returns 0.5 for HALF_DAY", () => {
    expect(attendanceWeight("HALF_DAY")).toBe(0.5);
  });

  it("returns 1 for PAID_LEAVE", () => {
    expect(attendanceWeight("PAID_LEAVE")).toBe(1);
  });

  it("returns 0 for ABSENT", () => {
    expect(attendanceWeight("ABSENT")).toBe(0);
  });

  it("returns 0 for LEAVE", () => {
    expect(attendanceWeight("LEAVE")).toBe(0);
  });

  it("returns 0 for NON_PAID_LEAVE", () => {
    expect(attendanceWeight("NON_PAID_LEAVE")).toBe(0);
  });

  it("returns 0 for unknown status", () => {
    expect(attendanceWeight("UNKNOWN")).toBe(0);
  });
});

describe("computeDaysWorked", () => {
  it("returns 0 for empty array", () => {
    expect(computeDaysWorked([]).toNumber()).toBe(0);
  });

  it("sums weights correctly for mixed statuses", () => {
    const attendances = [
      { status: "PRESENT" },     // 1
      { status: "LATE" },        // 1
      { status: "HALF_DAY" },    // 0.5
      { status: "ABSENT" },      // 0
      { status: "PAID_LEAVE" },  // 1
    ];
    expect(computeDaysWorked(attendances).toNumber()).toBe(3.5);
  });

  it("returns integer for all full-day statuses", () => {
    const attendances = [
      { status: "PRESENT" },
      { status: "PRESENT" },
      { status: "OVERTIME" },
    ];
    expect(computeDaysWorked(attendances).toNumber()).toBe(3);
  });
});

describe("computeOvertimeHours", () => {
  it("returns 0 for empty array", () => {
    expect(computeOvertimeHours([]).toNumber()).toBe(0);
  });

  it("sums overtime beyond 8 hours for attended days", () => {
    const attendances = [
      { status: "PRESENT", hoursWorked: 10 },     // 2h OT
      { status: "OVERTIME", hoursWorked: 9 },     // 1h OT
      { status: "PRESENT", hoursWorked: 8 },      // 0h OT
    ];
    expect(computeOvertimeHours(attendances).toNumber()).toBe(3);
  });

  it("ignores ABSENT and LEAVE days", () => {
    const attendances = [
      { status: "ABSENT", hoursWorked: 10 },
      { status: "LEAVE", hoursWorked: 12 },
      { status: "PAID_LEAVE", hoursWorked: 10 },
      { status: "NON_PAID_LEAVE", hoursWorked: 10 },
    ];
    expect(computeOvertimeHours(attendances).toNumber()).toBe(0);
  });

  it("handles null hoursWorked as 0", () => {
    const attendances = [
      { status: "PRESENT", hoursWorked: null },
    ];
    expect(computeOvertimeHours(attendances).toNumber()).toBe(0);
  });

  it("handles missing hoursWorked as 0", () => {
    const attendances = [
      { status: "PRESENT" },
    ];
    expect(computeOvertimeHours(attendances).toNumber()).toBe(0);
  });

  it("handles Decimal hoursWorked", () => {
    const attendances = [
      { status: "PRESENT", hoursWorked: new Decimal(10.5) },
    ];
    expect(computeOvertimeHours(attendances).toNumber()).toBe(2.5);
  });

  it("does not count negative overtime (less than 8h)", () => {
    const attendances = [
      { status: "PRESENT", hoursWorked: 6 },
      { status: "PRESENT", hoursWorked: 7 },
    ];
    expect(computeOvertimeHours(attendances).toNumber()).toBe(0);
  });
});

describe("computeStatusFromHours", () => {
  it("returns ABSENT for null hours", () => {
    expect(computeStatusFromHours(null)).toBe("ABSENT");
  });

  it("returns ABSENT for 0 hours", () => {
    expect(computeStatusFromHours(0)).toBe("ABSENT");
  });

  it("returns ABSENT for negative hours", () => {
    expect(computeStatusFromHours(-1)).toBe("ABSENT");
  });

  it("returns PRESENT for exactly standard hours (100%)", () => {
    expect(computeStatusFromHours(8, 8)).toBe("PRESENT");
  });

  it("returns OVERTIME for more than standard hours", () => {
    expect(computeStatusFromHours(9, 8)).toBe("OVERTIME");
    expect(computeStatusFromHours(10, 8)).toBe("OVERTIME");
  });

  it("returns LATE for 85-99% of standard hours", () => {
    // 85% of 8 = 6.8
    expect(computeStatusFromHours(6.8, 8)).toBe("LATE");
    // 99% of 8 = 7.92
    expect(computeStatusFromHours(7.92, 8)).toBe("LATE");
  });

  it("returns HALF_DAY for > 0 but < 85% of standard hours", () => {
    // 84% of 8 = 6.72
    expect(computeStatusFromHours(6.72, 8)).toBe("HALF_DAY");
    // 50% of 8 = 4
    expect(computeStatusFromHours(4, 8)).toBe("HALF_DAY");
    // 1% of 8 = 0.08
    expect(computeStatusFromHours(0.08, 8)).toBe("HALF_DAY");
  });

  it("returns PRESENT when standard hours is 0 (no standard defined)", () => {
    expect(computeStatusFromHours(5, 0)).toBe("PRESENT");
  });

  it("handles Decimal inputs", () => {
    expect(computeStatusFromHours(new Decimal(9), new Decimal(8))).toBe("OVERTIME");
    expect(computeStatusFromHours(new Decimal(7), new Decimal(8))).toBe("LATE");
  });

  it("boundary: exactly 85% is LATE", () => {
    // 85% of 8 = 6.8
    expect(computeStatusFromHours(6.8, 8)).toBe("LATE");
  });

  it("boundary: just below 85% is HALF_DAY", () => {
    // 84.99% of 8 = 6.7992
    expect(computeStatusFromHours(6.799, 8)).toBe("HALF_DAY");
  });
});

describe("countLateDays", () => {
  it("returns 0 for empty array", () => {
    expect(countLateDays([])).toBe(0);
  });

  it("counts only LATE statuses", () => {
    const attendances = [
      { status: "LATE" },
      { status: "PRESENT" },
      { status: "LATE" },
      { status: "ABSENT" },
      { status: "LATE" },
    ];
    expect(countLateDays(attendances)).toBe(3);
  });

  it("returns 0 when no lates", () => {
    const attendances = [
      { status: "PRESENT" },
      { status: "ABSENT" },
    ];
    expect(countLateDays(attendances)).toBe(0);
  });
});

describe("computeLateHalfDayDeductions", () => {
  it("returns 0 for 0-3 lates", () => {
    expect(computeLateHalfDayDeductions([])).toBe(0);
    expect(computeLateHalfDayDeductions([{ status: "LATE" }])).toBe(0);
    expect(computeLateHalfDayDeductions([{ status: "LATE" }, { status: "LATE" }])).toBe(0);
    expect(computeLateHalfDayDeductions([{ status: "LATE" }, { status: "LATE" }, { status: "LATE" }])).toBe(0);
  });

  it("returns 1 for 4 lates (4 lates → 1 half-day)", () => {
    const attendances = Array(4).fill({ status: "LATE" });
    expect(computeLateHalfDayDeductions(attendances)).toBe(1);
  });

  it("returns 1 for 5-7 lates", () => {
    expect(computeLateHalfDayDeductions(Array(5).fill({ status: "LATE" }))).toBe(1);
    expect(computeLateHalfDayDeductions(Array(7).fill({ status: "LATE" }))).toBe(1);
  });

  it("returns 2 for 8 lates", () => {
    expect(computeLateHalfDayDeductions(Array(8).fill({ status: "LATE" }))).toBe(2);
  });

  it("ignores non-LATE statuses", () => {
    const attendances = [
      { status: "LATE" }, { status: "LATE" }, { status: "LATE" },
      { status: "PRESENT" }, { status: "ABSENT" },
      { status: "LATE" },
    ];
    // 4 lates → 1 deduction
    expect(computeLateHalfDayDeductions(attendances)).toBe(1);
  });
});

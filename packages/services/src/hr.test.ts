import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  attendanceWeight,
  computeDaysWorked,
  computeOvertimeHours,
  computeWorkingDays,
  hourlyRateFor,
  computeBasicAmount,
  computeNetPay,
  computeStatusFromHours,
  countLateDays,
  computeLateHalfDayDeductions,
  computeAttendanceTier,
} from "./hr";

describe("attendanceWeight", () => {
  it("weights PRESENT and OVERTIME as 1, HALF_DAY as 0.5, others as 0", () => {
    expect(attendanceWeight("PRESENT")).toBe(1);
    expect(attendanceWeight("OVERTIME")).toBe(1);
    expect(attendanceWeight("HALF_DAY")).toBe(0.5);
    expect(attendanceWeight("ABSENT")).toBe(0);
    expect(attendanceWeight("LEAVE")).toBe(0);
  });
});

describe("computeDaysWorked", () => {
  it("sums attendance weights across records", () => {
    const days = computeDaysWorked([
      { status: "PRESENT" },
      { status: "PRESENT" },
      { status: "HALF_DAY" },
      { status: "ABSENT" },
      { status: "OVERTIME" },
      { status: "LEAVE" },
    ]);
    expect(days.toNumber()).toBe(3.5); // 1+1+0.5+0+1+0
  });

  it("returns 0 for an all-absent week", () => {
    const days = computeDaysWorked([
      { status: "ABSENT" },
      { status: "LEAVE" },
    ]);
    expect(days.toNumber()).toBe(0);
  });
});

describe("computeOvertimeHours", () => {
  it("sums hours beyond 8 for attended days only", () => {
    const ot = computeOvertimeHours([
      { status: "PRESENT", hoursWorked: 8 }, // 0 OT
      { status: "OVERTIME", hoursWorked: 10 }, // 2 OT
      { status: "HALF_DAY", hoursWorked: 4 }, // 0 OT
      { status: "ABSENT", hoursWorked: 12 }, // ignored (absent)
    ]);
    expect(ot.toNumber()).toBe(2);
  });

  it("treats missing hoursWorked as 0", () => {
    const ot = computeOvertimeHours([
      { status: "PRESENT", hoursWorked: null },
    ]);
    expect(ot.toNumber()).toBe(0);
  });
});

describe("computeWorkingDays", () => {
  it("counts Mon–Sat, excluding Sundays", () => {
    // 2024-01-01 (Mon) → 2024-01-07 (Sun): 6 working days
    const days = computeWorkingDays(new Date(2024, 0, 1), new Date(2024, 0, 7));
    expect(days).toBe(6);
  });

  it("returns at least 1 for a single Sunday", () => {
    const days = computeWorkingDays(new Date(2024, 0, 7), new Date(2024, 0, 7));
    expect(days).toBe(1);
  });

  it("counts a full 30-day month correctly", () => {
    // April 2024: 30 days, 4 Sundays → 26 working days
    const days = computeWorkingDays(new Date(2024, 3, 1), new Date(2024, 3, 30));
    expect(days).toBe(26);
  });
});

describe("hourlyRateFor", () => {
  it("derives hourly rate from dailyRate for DAILY workers", () => {
    const r = hourlyRateFor({ wageType: "DAILY", dailyRate: 800 }, 26);
    expect(r.toNumber()).toBe(100); // 800/8
  });

  it("derives hourly rate from monthlySalary for MONTHLY workers", () => {
    const r = hourlyRateFor({ wageType: "MONTHLY", dailyRate: 0, monthlySalary: 26000 }, 26);
    expect(r.toNumber()).toBe(125); // 26000 / (26*8) = 125
  });

  it("returns 0 for FIXED workers (no implied overtime)", () => {
    const r = hourlyRateFor({ wageType: "FIXED", dailyRate: 0, monthlySalary: 30000 }, 26);
    expect(r.toNumber()).toBe(0);
  });
});

describe("computeBasicAmount", () => {
  it("DAILY: dailyRate × daysWorked", () => {
    const basic = computeBasicAmount({ wageType: "DAILY", dailyRate: 500 }, new Decimal(20), 26);
    expect(basic.toNumber()).toBe(10000);
  });

  it("MONTHLY: salary prorated by attendance", () => {
    // 26000 salary, 26 working days, 13 days worked → 13000
    const basic = computeBasicAmount(
      { wageType: "MONTHLY", dailyRate: 0, monthlySalary: 26000 },
      new Decimal(13),
      26,
    );
    expect(basic.toNumber()).toBe(13000);
  });

  it("FIXED: full agreed amount regardless of attendance", () => {
    const basic = computeBasicAmount(
      { wageType: "FIXED", dailyRate: 0, monthlySalary: 30000 },
      new Decimal(5),
      26,
    );
    expect(basic.toNumber()).toBe(30000);
  });
});

describe("computeNetPay", () => {
  it("net = basic + overtime − deductions", () => {
    const net = computeNetPay(10000, 1500, 500);
    expect(net.toNumber()).toBe(11000);
  });

  it("handles zero overtime and deductions", () => {
    const net = computeNetPay(8000, 0, 0);
    expect(net.toNumber()).toBe(8000);
  });

  it("can go negative if deductions exceed earnings", () => {
    const net = computeNetPay(1000, 0, 2000);
    expect(net.toNumber()).toBe(-1000);
  });
});

describe("computeStatusFromHours (85% rule)", () => {
  it("returns ABSENT for 0 hours", () => {
    expect(computeStatusFromHours(0)).toBe("ABSENT");
  });

  it("returns ABSENT for null hours", () => {
    expect(computeStatusFromHours(null)).toBe("ABSENT");
  });

  it("returns HALF_DAY for < 85% of standard hours", () => {
    // 8h standard, 6h worked = 75% → HALF_DAY
    expect(computeStatusFromHours(6, 8)).toBe("HALF_DAY");
  });

  it("returns LATE for ≥ 85% but < 100%", () => {
    // 8h standard, 7h worked = 87.5% → LATE
    expect(computeStatusFromHours(7, 8)).toBe("LATE");
    // Exactly 85% → LATE
    expect(computeStatusFromHours(6.8, 8)).toBe("LATE");
  });

  it("returns PRESENT for exactly 100%", () => {
    expect(computeStatusFromHours(8, 8)).toBe("PRESENT");
  });

  it("returns OVERTIME for > 100%", () => {
    expect(computeStatusFromHours(9, 8)).toBe("OVERTIME");
  });
});

describe("countLateDays + computeLateHalfDayDeductions", () => {
  it("counts LATE records", () => {
    const attendances = [
      { status: "PRESENT" },
      { status: "LATE" },
      { status: "LATE" },
      { status: "ABSENT" },
      { status: "LATE" },
    ];
    expect(countLateDays(attendances)).toBe(3);
  });

  it("4 lates → 1 half-day deduction", () => {
    const attendances = [
      { status: "LATE" },
      { status: "LATE" },
      { status: "LATE" },
      { status: "LATE" },
    ];
    expect(computeLateHalfDayDeductions(attendances)).toBe(1);
  });

  it("7 lates → 1 half-day deduction (floor)", () => {
    const attendances = Array(7).fill({ status: "LATE" });
    expect(computeLateHalfDayDeductions(attendances)).toBe(1);
  });

  it("8 lates → 2 half-day deductions", () => {
    const attendances = Array(8).fill({ status: "LATE" });
    expect(computeLateHalfDayDeductions(attendances)).toBe(2);
  });

  it("0 lates → 0 deductions", () => {
    expect(computeLateHalfDayDeductions([{ status: "PRESENT" }])).toBe(0);
  });
});

describe("computeAttendanceTier", () => {
  it("RED for ABSENT", () => {
    expect(computeAttendanceTier({ status: "ABSENT" })).toBe("RED");
  });

  it("RED for NON_PAID_LEAVE", () => {
    expect(computeAttendanceTier({ status: "NON_PAID_LEAVE" })).toBe("RED");
  });

  it("GREEN for PAID_LEAVE", () => {
    expect(computeAttendanceTier({ status: "PAID_LEAVE" })).toBe("GREEN");
  });

  it("YELLOW for PRESENT without DPR approval", () => {
    expect(computeAttendanceTier({ status: "PRESENT", dprApproved: false })).toBe("YELLOW");
  });

  it("GREEN for PRESENT with DPR approval", () => {
    expect(computeAttendanceTier({ status: "PRESENT", dprApproved: true })).toBe("GREEN");
  });

  it("RED for PRESENT but outside geofence", () => {
    expect(computeAttendanceTier({ status: "PRESENT", geoFenceOk: false })).toBe("RED");
  });

  it("YELLOW for LATE without DPR approval", () => {
    expect(computeAttendanceTier({ status: "LATE", dprApproved: false })).toBe("YELLOW");
  });

  it("GREEN for LATE with DPR approval", () => {
    expect(computeAttendanceTier({ status: "LATE", dprApproved: true })).toBe("GREEN");
  });
});

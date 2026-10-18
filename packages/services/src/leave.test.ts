/**
 * Unit tests for the pure leave helper in leave.ts.
 *
 *   computeLeaveDays — count weekdays (Mon-Fri) between start and end dates (inclusive)
 */
import { describe, it, expect } from "vitest";
import { computeLeaveDays, effectiveLeaveEntitlement } from "./leave";

describe("computeLeaveDays", () => {
  it("counts weekdays in a single week (Mon-Fri)", () => {
    // Sep 7-11, 2026 is Mon-Fri
    const start = new Date("2026-09-07");
    const end = new Date("2026-09-11");
    expect(computeLeaveDays(start, end).toNumber()).toBe(5);
  });

  it("excludes weekends", () => {
    // Sep 7-13, 2026 is Mon-Sun (7 days, 5 weekdays)
    const start = new Date("2026-09-07");
    const end = new Date("2026-09-13");
    expect(computeLeaveDays(start, end).toNumber()).toBe(5);
  });

  it("returns 0 when end is before start", () => {
    const start = new Date("2026-09-10");
    const end = new Date("2026-09-05");
    expect(computeLeaveDays(start, end).toNumber()).toBe(0);
  });

  it("returns 1 for a single weekday", () => {
    // Sep 7, 2026 is Monday
    const start = new Date("2026-09-07");
    const end = new Date("2026-09-07");
    expect(computeLeaveDays(start, end).toNumber()).toBe(1);
  });

  it("returns 0 for a single weekend day", () => {
    // Sep 12, 2026 is Saturday
    const start = new Date("2026-09-12");
    const end = new Date("2026-09-12");
    expect(computeLeaveDays(start, end).toNumber()).toBe(0);
  });

  it("handles same start and end date on Sunday", () => {
    // Sep 13, 2026 is Sunday
    const start = new Date("2026-09-13");
    const end = new Date("2026-09-13");
    expect(computeLeaveDays(start, end).toNumber()).toBe(0);
  });

  it("counts weekdays across multiple weeks", () => {
    // Sep 7 - Sep 25, 2026 = 3 weeks → 15 weekdays
    const start = new Date("2026-09-07");
    const end = new Date("2026-09-25");
    expect(computeLeaveDays(start, end).toNumber()).toBe(15);
  });

  it("handles start on weekend, end on weekday", () => {
    // Sep 12 (Sat) - Sep 14 (Mon) → 1 weekday (Mon)
    const start = new Date("2026-09-12");
    const end = new Date("2026-09-14");
    expect(computeLeaveDays(start, end).toNumber()).toBe(1);
  });
});

describe("effectiveLeaveEntitlement", () => {
  it("uses per-employee paidLeaveQuota when set (e.g. 4 or 2 days)", () => {
    expect(effectiveLeaveEntitlement("CASUAL", 4)).toBe(4);
    expect(effectiveLeaveEntitlement("SICK", 2)).toBe(2);
    expect(effectiveLeaveEntitlement("EARNED", 0)).toBe(0);
  });

  it("keeps UNPAID leave uncapped even when paidLeaveQuota is set", () => {
    expect(effectiveLeaveEntitlement("UNPAID", 4)).toBe(0);
  });

  it("falls back to ANNUAL_LEAVE_ENTITLEMENT when paidLeaveQuota is null/undefined", () => {
    expect(effectiveLeaveEntitlement("CASUAL", null)).toBe(12);
    expect(effectiveLeaveEntitlement("EARNED", undefined)).toBe(20);
  });
});

/**
 * Unit tests for the pure recurring expense helper in recurring-expense.ts.
 *
 *   addPeriod — add a frequency period (WEEKLY/MONTHLY/QUARTERLY/YEARLY) to a date
 */
import { describe, it, expect } from "vitest";
import { addPeriod } from "./recurring-expense";

describe("addPeriod", () => {
  it("adds 7 days for WEEKLY", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addPeriod(base, "WEEKLY");
    expect(result.getDate()).toBe(11);
  });

  it("adds 1 month for MONTHLY", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addPeriod(base, "MONTHLY");
    expect(result.getMonth()).toBe(9); // October (0-indexed)
    expect(result.getDate()).toBe(4);
  });

  it("adds 3 months for QUARTERLY", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addPeriod(base, "QUARTERLY");
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(4);
  });

  it("adds 1 year for YEARLY", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addPeriod(base, "YEARLY");
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(8); // September
  });

  it("returns the same date for unknown frequency", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addPeriod(base, "UNKNOWN");
    expect(result.getTime()).toBe(base.getTime());
  });

  it("does not mutate the original date", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const originalTime = base.getTime();
    addPeriod(base, "MONTHLY");
    expect(base.getTime()).toBe(originalTime);
  });

  it("clamps month-end instead of skipping February (Jan 31 → Feb 28)", () => {
    const base = new Date(2026, 0, 31, 10);
    const result = addPeriod(base, "MONTHLY");
    expect(result.getMonth()).toBe(1); // February — never skipped
    expect(result.getDate()).toBe(28);
  });

  it("snaps back to the anchor day after a short month (Feb 28 → Mar 31)", () => {
    const feb = new Date(2026, 1, 28, 10);
    const result = addPeriod(feb, "MONTHLY", 31);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(31);
  });

  it("clamps QUARTERLY from Nov 30 to Feb 28", () => {
    const result = addPeriod(new Date(2026, 10, 30, 10), "QUARTERLY");
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it("clamps YEARLY leap day (Feb 29 2028 → Feb 28 2029)", () => {
    const result = addPeriod(new Date(2028, 1, 29, 10), "YEARLY");
    expect(result.getFullYear()).toBe(2029);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it("handles year boundary for YEARLY", () => {
    const base = new Date("2026-12-31T10:00:00Z");
    const result = addPeriod(base, "YEARLY");
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(11); // December
  });

  it("handles WEEKLY across month boundary", () => {
    const base = new Date("2026-09-28T10:00:00Z");
    const result = addPeriod(base, "WEEKLY");
    expect(result.getMonth()).toBe(9); // October
    expect(result.getDate()).toBe(5);
  });
});

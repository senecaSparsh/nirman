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

  it("handles month overflow (Jan 31 + 1 month → Mar 3)", () => {
    const base = new Date("2026-01-31T10:00:00Z");
    const result = addPeriod(base, "MONTHLY");
    // Jan 31 + 1 month → Feb 31 doesn't exist → rolls to Mar 3
    expect(result.getMonth()).toBe(2); // March
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

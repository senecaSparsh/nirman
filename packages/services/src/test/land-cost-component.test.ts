/**
 * Unit tests for the pure accrual helpers in land-cost-component.ts:
 *   - effectivePostedAmount (ONE_TIME + RECURRING, with endDate / occurrences caps)
 *   - scheduledTotal
 *
 * These are pure functions — no DB, no mocking needed.
 */
import { describe, it, expect } from "vitest";
import { effectivePostedAmount, scheduledTotal } from "../land-cost-component";
import Decimal from "decimal.js";

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

describe("effectivePostedAmount", () => {
  it("ONE_TIME: returns full amount once startDate has elapsed", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    const c = {
      amount: new Decimal(500000),
      frequency: "ONE_TIME" as const,
      interval: null,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: null,
      occurrences: null,
    };
    expect(effectivePostedAmount(c, now).toString()).toBe("500000");
  });

  it("ONE_TIME: returns 0 before startDate (future-dated charge)", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    const c = {
      amount: new Decimal(500000),
      frequency: "ONE_TIME" as const,
      interval: null,
      startDate: new Date("2027-01-01T00:00:00Z"),
      endDate: null,
      occurrences: null,
    };
    expect(effectivePostedAmount(c, now).toString()).toBe("0");
  });

  it("ONE_TIME: returns full amount exactly on startDate", () => {
    const start = new Date("2026-09-02T00:00:00Z");
    const c = {
      amount: new Decimal(100000),
      frequency: "ONE_TIME" as const,
      interval: null,
      startDate: start,
      endDate: null,
      occurrences: null,
    };
    expect(effectivePostedAmount(c, start).toString()).toBe("100000");
  });

  it("RECURRING yearly: accrues one occurrence at startDate, two after one year", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: start,
      endDate: null,
      occurrences: null,
    };
    // At start: 1 occurrence
    expect(effectivePostedAmount(c, start).toString()).toBe("500000");
    // After 6 months: still 1
    expect(effectivePostedAmount(c, new Date(start.getTime() + 180 * DAY)).toString()).toBe("500000");
    // After 1 year + 1 day: 2 occurrences
    expect(effectivePostedAmount(c, new Date(start.getTime() + YEAR + DAY)).toString()).toBe("1000000");
    // After 2 years: 3 occurrences
    expect(effectivePostedAmount(c, new Date(start.getTime() + 2 * YEAR)).toString()).toBe("1500000");
  });

  it("RECURRING monthly: accrues per month", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const c = {
      amount: new Decimal(10000),
      frequency: "RECURRING" as const,
      interval: "MONTHLY" as const,
      startDate: start,
      endDate: null,
      occurrences: null,
    };
    // At start: 1
    expect(effectivePostedAmount(c, start).toString()).toBe("10000");
    // After 30 days: 2
    expect(effectivePostedAmount(c, new Date(start.getTime() + 30 * DAY)).toString()).toBe("20000");
    // After 90 days: 4
    expect(effectivePostedAmount(c, new Date(start.getTime() + 90 * DAY)).toString()).toBe("40000");
  });

  it("RECURRING: capped by occurrences", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: start,
      endDate: null,
      occurrences: 3,
    };
    // After 10 years — should still be capped at 3 × 500000
    expect(effectivePostedAmount(c, new Date(start.getTime() + 10 * YEAR)).toString()).toBe("1500000");
  });

  it("RECURRING: capped by endDate", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date("2026-06-01T00:00:00Z"); // ~1.5 years → 2 occurrences
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: start,
      endDate: end,
      occurrences: null,
    };
    // Well after endDate — capped at 2
    expect(effectivePostedAmount(c, new Date("2030-01-01T00:00:00Z")).toString()).toBe("1000000");
  });

  it("RECURRING: returns 0 before startDate", () => {
    const start = new Date("2027-01-01T00:00:00Z");
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: start,
      endDate: null,
      occurrences: null,
    };
    expect(effectivePostedAmount(c, new Date("2026-09-02T00:00:00Z")).toString()).toBe("0");
  });

  it("RECURRING without interval returns 0 (defensive)", () => {
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: null,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      occurrences: null,
    };
    expect(effectivePostedAmount(c, new Date()).toString()).toBe("0");
  });

  it("accepts plain numbers/strings for amount", () => {
    const c = {
      amount: 500000 as unknown as Decimal,
      frequency: "ONE_TIME" as const,
      interval: null,
      startDate: new Date("2020-01-01T00:00:00Z"),
      endDate: null,
      occurrences: null,
    };
    expect(effectivePostedAmount(c).toString()).toBe("500000");
  });
});

describe("scheduledTotal", () => {
  it("ONE_TIME: returns the amount", () => {
    const c = {
      amount: new Decimal(75000),
      frequency: "ONE_TIME" as const,
      interval: null,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: null,
      occurrences: null,
    };
    expect(scheduledTotal(c).toString()).toBe("75000");
  });

  it("RECURRING with occurrences: amount × occurrences", () => {
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      occurrences: 10,
    };
    expect(scheduledTotal(c).toString()).toBe("5000000");
  });

  it("RECURRING with endDate: amount × derived count", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date("2027-01-01T00:00:00Z"); // exactly 2 years → 3 occurrences (start + 2)
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: start,
      endDate: end,
      occurrences: null,
    };
    expect(scheduledTotal(c).toString()).toBe("1500000");
  });

  it("RECURRING indefinite (no end, no occurrences): returns 0 (open-ended signal)", () => {
    const c = {
      amount: new Decimal(500000),
      frequency: "RECURRING" as const,
      interval: "YEARLY" as const,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      occurrences: null,
    };
    expect(scheduledTotal(c).toString()).toBe("0");
  });
});

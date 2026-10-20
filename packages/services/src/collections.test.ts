import { describe, it, expect } from "vitest";
import { computeLateInterest, LATE_INTEREST_RATE } from "./collections";

describe("computeLateInterest", () => {
  const due = new Date("2026-09-01");
  const asOf = new Date("2026-10-01"); // 30 days later

  it("returns null when not yet due", () => {
    expect(computeLateInterest({ totalAmount: 100000, paidAmount: 0, dueDate: "2026-11-01", asOf })).toBeNull();
  });

  it("returns null when no dueDate (CLP milestone not yet triggered)", () => {
    expect(computeLateInterest({ totalAmount: 100000, paidAmount: 0, dueDate: null, asOf })).toBeNull();
  });

  it("returns null when fully paid", () => {
    expect(computeLateInterest({ totalAmount: 100000, paidAmount: 100000, dueDate: due, asOf })).toBeNull();
  });

  it("accrues MCLR+2% simple daily interest on the outstanding balance", () => {
    const r = computeLateInterest({ totalAmount: 100000, paidAmount: 0, dueDate: due, asOf })!;
    // 100000 × 10.65% × 30/365 = 875.34
    expect(r.daysOverdue).toBe(30);
    expect(r.ratePercent).toBe(LATE_INTEREST_RATE.toFixed(2));
    expect(r.principalDue).toBe("100000.00");
    expect(Number(r.interest)).toBeCloseTo(875.34, 2);
    expect(Number(r.totalPayable)).toBeCloseTo(100875.34, 2);
  });

  it("nets out partial payments before accruing", () => {
    const r = computeLateInterest({ totalAmount: 100000, paidAmount: 40000, dueDate: due, asOf })!;
    // 60000 × 10.65% × 30/365 = 525.21
    expect(Number(r.interest)).toBeCloseTo(525.21, 2);
    expect(Number(r.totalPayable)).toBeCloseTo(60525.21, 2);
  });

  it("rate defaults to SBI MCLR (8.65) + 2 = 10.65% p.a.", () => {
    expect(LATE_INTEREST_RATE.toFixed(2)).toBe("10.65");
  });
});

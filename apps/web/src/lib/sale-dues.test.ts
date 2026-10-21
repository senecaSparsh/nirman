import { describe, it, expect } from "vitest";
import { principalCollected, saleContractValue, saleDues, saleDuesSummary } from "./sale-dues";

const sale = (over: Partial<Parameters<typeof saleDues>[0]> = {}) => ({
  salePrice: 1_000_000,
  gstAmount: 50_000,
  tdsAmount: 10_000,
  payments: [{ amount: 500_000, status: "PAID" }],
  ...over,
});

describe("saleContractValue", () => {
  it("adds GST to the sale price", () => {
    expect(saleContractValue(sale())).toBe(1_050_000);
  });

  it("treats missing GST as zero", () => {
    expect(saleContractValue(sale({ gstAmount: null }))).toBe(1_000_000);
  });
});

describe("principalCollected", () => {
  it("ignores VOID payments", () => {
    expect(
      principalCollected([
        { amount: 100, status: "PAID" },
        { amount: 900, status: "VOID" },
      ]),
    ).toBe(100);
  });

  it("strips late-payment interest out of the principal", () => {
    expect(principalCollected([{ amount: 1_100, interestAmount: 100, status: "PAID" }])).toBe(1000);
  });

  it("handles a missing payment list", () => {
    expect(principalCollected(undefined)).toBe(0);
  });
});

describe("saleDues", () => {
  it("nets GST in and TDS withheld out", () => {
    // 10,50,000 contract − 10,000 TDS − 5,00,000 paid
    expect(saleDues(sale())).toBe(540_000);
  });

  it("does not bill the buyer for TDS they already deposited", () => {
    // Fully paid in cash terms + TDS withheld = nothing left to collect.
    const fully = sale({
      salePrice: 1_000_000,
      gstAmount: 0,
      tdsAmount: 10_000,
      payments: [{ amount: 990_000, status: "PAID" }],
    });
    expect(saleDues(fully)).toBe(0);
  });

  it("accepts a precomputed principalPaid from list payloads", () => {
    expect(saleDues({ salePrice: 1_000_000, gstAmount: 0, tdsAmount: 0, principalPaid: 400_000 })).toBe(600_000);
    expect(saleDues({ salePrice: 1_000_000, gstAmount: 0, tdsAmount: 0, principalPaid: 0 })).toBe(1_000_000);
  });

  it("floors an overpaid sale at zero instead of creating a credit", () => {
    expect(saleDues(sale({ payments: [{ amount: 2_000_000, status: "PAID" }] }))).toBe(0);
  });

  it("does not let interest collection reduce dues", () => {
    // ₹5,00,000 received, of which ₹25,000 is late-payment interest — only
    // ₹4,75,000 retires principal, so dues rise to ₹5,65,000, never fall.
    const withInterest = sale({ payments: [{ amount: 500_000, interestAmount: 25_000, status: "PAID" }] });
    expect(saleDues(withInterest)).toBe(565_000);
  });
});

describe("saleDuesSummary", () => {
  it("sums booked, collected and dues across sales", () => {
    const summary = saleDuesSummary([
      sale(),
      sale({ salePrice: 500_000, gstAmount: 0, tdsAmount: 0, payments: [{ amount: 500_000, status: "PAID" }] }),
    ]);
    expect(summary.booked).toBe(1_500_000);
    expect(summary.collected).toBe(1_000_000);
    expect(summary.dues).toBe(540_000);
    expect(summary.salesWithDues).toBe(1);
  });

  it("does not net an overpayment against another buyer's dues", () => {
    const summary = saleDuesSummary([
      sale({ payments: [{ amount: 3_000_000, status: "PAID" }] }),
      sale(),
    ]);
    expect(summary.dues).toBe(540_000);
    expect(summary.salesWithDues).toBe(1);
  });

  it("returns zeros for an empty book", () => {
    expect(saleDuesSummary([])).toEqual({ booked: 0, collected: 0, dues: 0, salesWithDues: 0 });
  });
});

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  validateAreaConservation,
  allocateCostByArea,
} from "./partition";
import {
  computeSaleProfit,
  computePaymentStatus,
  autoGenerateScheduleItems,
} from "./sale";
import {
  computeMovingAverageCost,
  stockValueAfterIssue,
} from "./moving-average-cost";

describe("partition: validateAreaConservation", () => {
  it("passes when children sum exactly equals parent", () => {
    const result = validateAreaConservation(
      new Decimal(5000),
      [new Decimal(1000), new Decimal(1500), new Decimal(2500)],
    );
    expect(result.valid).toBe(true);
    expect(result.difference.toNumber()).toBe(0);
  });

  it("fails when children sum is less than parent (land lost)", () => {
    const result = validateAreaConservation(
      new Decimal(5000),
      [new Decimal(1000), new Decimal(1000), new Decimal(1000)],
    );
    expect(result.valid).toBe(false);
    expect(result.difference.toNumber()).toBe(-2000);
  });

  it("fails when children sum exceeds parent (magic land created)", () => {
    const result = validateAreaConservation(
      new Decimal(5000),
      [new Decimal(2000), new Decimal(2000), new Decimal(2000)],
    );
    expect(result.valid).toBe(false);
    expect(result.difference.toNumber()).toBe(1000);
  });

  it("handles decimal areas to 3 places", () => {
    const result = validateAreaConservation(
      new Decimal("100.500"),
      [new Decimal("33.500"), new Decimal("33.500"), new Decimal("33.500")],
    );
    expect(result.valid).toBe(true);
  });
});

describe("partition: allocateCostByArea", () => {
  it("allocates cost proportionally by area", () => {
    // Parent: 5000 sqft, ₹10,00,000
    // Children: 1000 (20%), 1500 (30%), 2500 (50%)
    // Expected: ₹2,00,000, ₹3,00,000, ₹5,00,000
    const costs = allocateCostByArea(
      new Decimal(1000000),
      new Decimal(5000),
      [new Decimal(1000), new Decimal(1500), new Decimal(2500)],
    );
    expect(costs[0]!.toNumber()).toBe(200000);
    expect(costs[1]!.toNumber()).toBe(300000);
    expect(costs[2]!.toNumber()).toBe(500000);
  });

  it("sum of allocated costs equals parent cost", () => {
    const costs = allocateCostByArea(
      new Decimal(750000),
      new Decimal(3000),
      [new Decimal(1200), new Decimal(800), new Decimal(1000)],
    );
    const sum = costs.reduce((acc, c) => acc.plus(c), new Decimal(0));
    expect(sum.toNumber()).toBe(750000);
  });

  it("handles uneven split", () => {
    // Parent: 1000 sqft, ₹5,00,000
    // Children: 1 sqft, 999 sqft
    const costs = allocateCostByArea(
      new Decimal(500000),
      new Decimal(1000),
      [new Decimal(1), new Decimal(999)],
    );
    expect(costs[0]!.toNumber()).toBe(500);
    expect(costs[1]!.toNumber()).toBe(499500);
  });
});

describe("sale: computeSaleProfit", () => {
  it("computes profit for a profitable sale", () => {
    const profit = computeSaleProfit(new Decimal(5000000), new Decimal(3000000));
    expect(profit.toNumber()).toBe(2000000);
  });

  it("computes negative profit (loss) for below-cost sale", () => {
    const profit = computeSaleProfit(new Decimal(2500000), new Decimal(3000000));
    expect(profit.toNumber()).toBe(-500000);
  });

  it("computes zero profit at break-even", () => {
    const profit = computeSaleProfit(new Decimal(3000000), new Decimal(3000000));
    expect(profit.toNumber()).toBe(0);
  });
});

describe("sale: computePaymentStatus", () => {
  it("returns PENDING when nothing paid", () => {
    expect(computePaymentStatus(new Decimal(0), new Decimal(5000000))).toBe("PENDING");
  });

  it("returns PARTIAL when partially paid", () => {
    expect(computePaymentStatus(new Decimal(2000000), new Decimal(5000000))).toBe("PARTIAL");
  });

  it("returns PAID when fully paid", () => {
    expect(computePaymentStatus(new Decimal(5000000), new Decimal(5000000))).toBe("PAID");
  });

  it("returns PAID when overpaid (edge case — should be blocked at payment time)", () => {
    expect(computePaymentStatus(new Decimal(5500000), new Decimal(5000000))).toBe("PAID");
  });
});

describe("sale: autoGenerateScheduleItems", () => {
  it("generates advance + equal monthly installments", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 500000, 4);
    expect(items.length).toBe(5);
    expect(items[0]!.description).toBe("Booking Advance");
    expect(Number(items[0]!.amount)).toBe(500000);
    expect(Number(items[1]!.amount)).toBe(1125000);
    expect(Number(items[4]!.amount)).toBe(1125000);
  });

  it("percentages sum to exactly 100%", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 500000, 4);
    const totalPct = items.reduce((s, item) => s + Number(item.percentage), 0);
    expect(Math.abs(totalPct - 100)).toBeLessThan(0.01);
  });

  it("returns empty when fully paid (no balance)", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 5000000, 4);
    expect(items.length).toBe(0);
  });

  it("returns empty when dealMaturityMonths is 0", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 500000, 0);
    expect(items.length).toBe(0);
  });

  it("generates installments without advance when advance is 0", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 0, 3);
    expect(items.length).toBe(3);
    expect(items[0]!.description).toContain("Installment 1");
    expect(Number(items[0]!.amount)).toBeCloseTo(1666666.67, 1);
  });

  it("includes GST in total collectible", () => {
    const items = autoGenerateScheduleItems(5000000, 900000, 0, 1);
    expect(items.length).toBe(1);
    expect(Number(items[0]!.amount)).toBe(5900000);
  });

  it("assigns due dates to future months", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 0, 3);
    expect(items[0]!.dueDate).toBeTruthy();
    const now = new Date();
    const firstDue = new Date(items[0]!.dueDate!);
    expect(firstDue.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("sale: autoGenerateScheduleItems", () => {
  it("generates advance + equal monthly installments", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 500000, 4);
    // Advance = 1 item + 4 monthly = 5 total
    expect(items.length).toBe(5);
    // First item is the advance
    expect(items[0]!.description).toBe("Booking Advance");
    expect(Number(items[0]!.amount)).toBe(500000);
    // Remaining 4 installments of (5000000 - 500000) / 4 = 1125000 each
    expect(Number(items[1]!.amount)).toBe(1125000);
    expect(Number(items[4]!.amount)).toBe(1125000);
  });

  it("percentages sum to exactly 100%", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 500000, 4);
    const totalPct = items.reduce((s, item) => s + Number(item.percentage), 0);
    expect(Math.abs(totalPct - 100)).toBeLessThan(0.01);
  });

  it("returns empty when fully paid (no balance)", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 5000000, 4);
    expect(items.length).toBe(0);
  });

  it("returns empty when dealMaturityMonths is 0", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 500000, 0);
    expect(items.length).toBe(0);
  });

  it("generates installments without advance when advance is 0", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 0, 3);
    // No advance, 3 monthly installments
    expect(items.length).toBe(3);
    expect(items[0]!.description).toContain("Installment 1");
    // Each installment = 5000000 / 3
    expect(Number(items[0]!.amount)).toBeCloseTo(1666666.67, 1);
  });

  it("includes GST in total collectible", () => {
    const items = autoGenerateScheduleItems(5000000, 900000, 0, 1);
    // Total = 5900000, 1 installment = 5900000
    expect(items.length).toBe(1);
    expect(Number(items[0]!.amount)).toBe(5900000);
  });

  it("assigns due dates to future months", () => {
    const items = autoGenerateScheduleItems(5000000, 0, 0, 3);
    expect(items[0]!.dueDate).toBeTruthy();
    expect(items[1]!.dueDate).toBeTruthy();
    // Due dates should be in the future
    const now = new Date();
    const firstDue = new Date(items[0]!.dueDate!);
    expect(firstDue.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("MAC: end-to-end scenario", () => {
  it("tracks MAC through a realistic receipt + issue cycle", () => {
    // Day 1: receive 100 bags @ ₹350 → MAC = ₹350
    let mac = computeMovingAverageCost(new Decimal(0), new Decimal(0), new Decimal(100), new Decimal(350));
    expect(mac.toNumber()).toBe(350);

    // Day 3: receive 100 bags @ ₹400 → MAC = (100×350 + 100×400) / 200 = ₹375
    mac = computeMovingAverageCost(new Decimal(100), mac, new Decimal(100), new Decimal(400));
    expect(mac.toNumber()).toBe(375);

    // Day 5: issue 50 bags to project at MAC ₹375 → project cost = 50 × 375 = ₹18,750
    // After issue: 200 - 50 = 150 bags remaining, value = 150 × 375 = ₹56,250
    const remainingValue = stockValueAfterIssue(new Decimal(150), mac);
    expect(remainingValue.toNumber()).toBe(56250);

    // The issue cost = 50 × 375 = ₹18,750
    const issueCost = new Decimal(50).times(mac);
    expect(issueCost.toNumber()).toBe(18750);

    // Day 7: receive 50 bags @ ₹450 → MAC = (150×375 + 50×450) / 200 = (56250 + 22500) / 200 = ₹393.75
    mac = computeMovingAverageCost(new Decimal(150), mac, new Decimal(50), new Decimal(450));
    expect(mac.toNumber()).toBe(393.75);
  });
});

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { computeTransferPrice } from "./transfer";

describe("transfer: computeTransferPrice", () => {
  it("returns zeros for an empty line set", () => {
    const r = computeTransferPrice([], 1000, 200, 10);
    expect(r.transferPriceTotal.toNumber()).toBe(0);
    expect(r.lines).toHaveLength(0);
  });

  it("with no charges, TP equals base cost (qty × source MAC)", () => {
    const r = computeTransferPrice([{ qty: 10, unitCostAtSource: 350 }]);
    expect(r.lines[0]!.baseCost.toNumber()).toBe(3500);
    expect(r.lines[0]!.lineTransferTotal.toNumber()).toBe(3500);
    expect(r.lines[0]!.unitTransferPrice.toNumber()).toBe(350);
    expect(r.transferPriceTotal.toNumber()).toBe(3500);
  });

  it("applies markup % to each line base cost", () => {
    // 10 units @ 100 = base 1000, markup 10% → +100 → TP 1100, unit TP 110
    const r = computeTransferPrice([{ qty: 10, unitCostAtSource: 100 }], 0, 0, 10);
    expect(r.lines[0]!.markup.toNumber()).toBe(100);
    expect(r.lines[0]!.lineTransferTotal.toNumber()).toBe(1100);
    expect(r.lines[0]!.unitTransferPrice.toNumber()).toBe(110);
  });

  it("allocates freight by base-cost weight across lines", () => {
    // Line A: 10 × 100 = 1000 (2/3 weight), Line B: 5 × 100 = 500 (1/3 weight)
    // freight 300 → A gets 200, B gets 100
    const r = computeTransferPrice(
      [
        { qty: 10, unitCostAtSource: 100 },
        { qty: 5, unitCostAtSource: 100 },
      ],
      300,
      0,
      0,
    );
    expect(r.lines[0]!.freight.toNumber()).toBe(200);
    expect(r.lines[1]!.freight.toNumber()).toBe(100);
    expect(r.totalFreight.toNumber()).toBe(300);
  });

  it("allocates handling fee by base-cost weight across lines", () => {
    const r = computeTransferPrice(
      [
        { qty: 10, unitCostAtSource: 100 },
        { qty: 5, unitCostAtSource: 100 },
      ],
      0,
      150,
      0,
    );
    expect(r.lines[0]!.handling.toNumber()).toBe(100);
    expect(r.lines[1]!.handling.toNumber()).toBe(50);
    expect(r.totalHandling.toNumber()).toBe(150);
  });

  it("combines freight + handling + markup on a single line", () => {
    // 50 MT steel @ 50000/MT = base 2,500,000
    // freight 40000, handling 5000, markup 5%
    // markup = 2,500,000 × 5% = 125,000
    // TP = 2,500,000 + 40,000 + 5,000 + 125,000 = 2,670,000
    // unit TP = 2,670,000 / 50 = 53,400
    const r = computeTransferPrice(
      [{ qty: 50, unitCostAtSource: 50000 }],
      40000,
      5000,
      5,
    );
    expect(r.lines[0]!.baseCost.toNumber()).toBe(2500000);
    expect(r.lines[0]!.freight.toNumber()).toBe(40000);
    expect(r.lines[0]!.handling.toNumber()).toBe(5000);
    expect(r.lines[0]!.markup.toNumber()).toBe(125000);
    expect(r.lines[0]!.lineTransferTotal.toNumber()).toBe(2670000);
    expect(r.lines[0]!.unitTransferPrice.toNumber()).toBe(53400);
    expect(r.transferPriceTotal.toNumber()).toBe(2670000);
  });

  it("sum of line transfer totals equals header transferPriceTotal", () => {
    const r = computeTransferPrice(
      [
        { qty: 10, unitCostAtSource: 100 },
        { qty: 20, unitCostAtSource: 200 },
        { qty: 5, unitCostAtSource: 50 },
      ],
      1000,
      200,
      8,
    );
    const sumLines = r.lines.reduce((s, l) => s.plus(l.lineTransferTotal), new Decimal(0));
    expect(sumLines.toNumber()).toBeCloseTo(r.transferPriceTotal.toNumber(), 2);
  });

  it("handles zero qty gracefully (unit TP = 0, no division error)", () => {
    const r = computeTransferPrice([{ qty: 0, unitCostAtSource: 100 }], 0, 0, 10);
    expect(r.lines[0]!.unitTransferPrice.toNumber()).toBe(0);
    expect(r.lines[0]!.lineTransferTotal.toNumber()).toBe(0);
  });

  it("allocates freight evenly when all base costs are equal", () => {
    // Two lines with identical base cost → freight split 50/50
    const r = computeTransferPrice(
      [
        { qty: 10, unitCostAtSource: 100 },
        { qty: 10, unitCostAtSource: 100 },
      ],
      500,
      0,
      0,
    );
    expect(r.lines[0]!.freight.toNumber()).toBe(250);
    expect(r.lines[1]!.freight.toNumber()).toBe(250);
  });

  it("treats absent charges as zero (markup only)", () => {
    const r = computeTransferPrice([{ qty: 4, unitCostAtSource: 250 }], undefined, undefined, undefined);
    expect(r.lines[0]!.lineTransferTotal.toNumber()).toBe(1000);
    expect(r.lines[0]!.unitTransferPrice.toNumber()).toBe(250);
    expect(r.totalFreight.toNumber()).toBe(0);
    expect(r.totalHandling.toNumber()).toBe(0);
    expect(r.totalMarkup.toNumber()).toBe(0);
  });

  it("inter-company STO scenario: central → project with markup + freight", () => {
    // Central warehouse issues 20 bags cement @ 350 MAC to a project-site location
    // owned by a different SPV. Freight 2000, handling 300, markup 3%.
    // base = 20 × 350 = 7000
    // freight = 2000 (single line → full weight)
    // handling = 300
    // markup = 7000 × 3% = 210
    // TP = 7000 + 2000 + 300 + 210 = 9510
    // unit TP = 9510 / 20 = 475.5
    const r = computeTransferPrice(
      [{ qty: 20, unitCostAtSource: 350 }],
      2000,
      300,
      3,
    );
    expect(r.lines[0]!.baseCost.toNumber()).toBe(7000);
    expect(r.lines[0]!.lineTransferTotal.toNumber()).toBe(9510);
    expect(r.lines[0]!.unitTransferPrice.toNumber()).toBe(475.5);
    expect(r.transferPriceTotal.toNumber()).toBe(9510);
  });
});

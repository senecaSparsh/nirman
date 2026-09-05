/**
 * Unit tests for the pure built unit helpers extracted from built-unit.ts.
 *
 *   validateBuiltUnitsBatch        — validate unit batch before creation
 *   computeWipCapitalizationDelta  — productionCost − alreadyCapitalized
 */
import { describe, it, expect } from "vitest";
import { validateBuiltUnitsBatch, computeWipCapitalizationDelta } from "./built-unit";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateBuiltUnitsBatch", () => {
  it("passes for valid units with positive areas and unique numbers", () => {
    expect(() =>
      validateBuiltUnitsBatch([
        { unitNumber: "A-101", area: 1000 },
        { unitNumber: "A-102", area: 1200 },
      ]),
    ).not.toThrow();
  });

  it("throws when units array is empty", () => {
    expect(() => validateBuiltUnitsBatch([])).toThrow("Must create at least one unit");
  });

  it("throws when any area is 0", () => {
    expect(() =>
      validateBuiltUnitsBatch([
        { unitNumber: "A-101", area: 1000 },
        { unitNumber: "A-102", area: 0 },
      ]),
    ).toThrow("Unit A-102 area must be > 0");
  });

  it("throws when any area is negative", () => {
    expect(() =>
      validateBuiltUnitsBatch([{ unitNumber: "A-101", area: -100 }]),
    ).toThrow("Unit A-101 area must be > 0");
  });

  it("throws when unit numbers are duplicated", () => {
    expect(() =>
      validateBuiltUnitsBatch([
        { unitNumber: "A-101", area: 1000 },
        { unitNumber: "A-101", area: 1200 },
      ]),
    ).toThrow("Unit numbers must be unique within the batch");
  });

  it("accepts Decimal area", () => {
    expect(() =>
      validateBuiltUnitsBatch([{ unitNumber: "A-101", area: new Decimal(1000) }]),
    ).not.toThrow();
  });

  it("accepts string area", () => {
    expect(() =>
      validateBuiltUnitsBatch([{ unitNumber: "A-101", area: "1000.5" }]),
    ).not.toThrow();
  });

  it("passes for single unit", () => {
    expect(() =>
      validateBuiltUnitsBatch([{ unitNumber: "A-101", area: 1000 }]),
    ).not.toThrow();
  });
});

describe("computeWipCapitalizationDelta", () => {
  it("returns positive delta when productionCost > capitalized", () => {
    const delta = computeWipCapitalizationDelta(new Decimal(500000), new Decimal(300000));
    expect(delta.toNumber()).toBe(200000);
  });

  it("returns zero when productionCost equals capitalized", () => {
    const delta = computeWipCapitalizationDelta(new Decimal(500000), new Decimal(500000));
    expect(delta.toNumber()).toBe(0);
  });

  it("returns negative delta when capitalized > productionCost (over-capitalized)", () => {
    const delta = computeWipCapitalizationDelta(new Decimal(300000), new Decimal(500000));
    expect(delta.toNumber()).toBe(-200000);
  });

  it("handles zero productionCost", () => {
    const delta = computeWipCapitalizationDelta(new Decimal(0), new Decimal(0));
    expect(delta.toNumber()).toBe(0);
  });
});

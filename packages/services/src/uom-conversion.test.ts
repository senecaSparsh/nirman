/**
 * Unit tests for the pure UOM conversion functions in uom-conversion.ts.
 *
 *   toBaseUnit       — convert secondary unit → base unit (multiply by factor)
 *   toSecondaryUnit  — convert base unit → secondary unit (divide by factor)
 *   displayQty       — format for display showing both units
 *
 * Example: Cement purchased in BAGs but tracked in KG.
 *   baseUnit = "KG", secondaryUnit = "BAG", conversionFactor = 50
 *   → 1 BAG = 50 KG
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import { toBaseUnit, toSecondaryUnit, displayQty, type UomMaterial } from "./uom-conversion";
import Decimal from "decimal.js";

const CEMENT: UomMaterial = {
  baseUnit: "KG",
  secondaryUnit: "BAG",
  uomConversionFactor: new Decimal(50), // 1 BAG = 50 KG
};

const STEEL: UomMaterial = {
  baseUnit: "KG",
  secondaryUnit: "TON",
  uomConversionFactor: new Decimal(1000), // 1 TON = 1000 KG
};

const SIMPLE: UomMaterial = {
  baseUnit: "PCS",
  // no secondary unit or conversion factor
};

describe("toBaseUnit", () => {
  it("converts secondary units to base units by multiplying by factor", () => {
    // 3 BAG × 50 = 150 KG
    expect(toBaseUnit(3, CEMENT).toNumber()).toBe(150);
  });

  it("handles Decimal input", () => {
    expect(toBaseUnit(new Decimal(5), CEMENT).toNumber()).toBe(250);
  });

  it("handles string input", () => {
    expect(toBaseUnit("2", CEMENT).toNumber()).toBe(100);
  });

  it("returns qty unchanged when no secondary unit configured", () => {
    expect(toBaseUnit(100, SIMPLE).toNumber()).toBe(100);
  });

  it("returns qty unchanged when conversion factor is null", () => {
    const material: UomMaterial = {
      baseUnit: "KG",
      secondaryUnit: "BAG",
      uomConversionFactor: null,
    };
    expect(toBaseUnit(5, material).toNumber()).toBe(5);
  });

  it("throws when conversion factor is 0 (division by zero guard)", () => {
    const material: UomMaterial = {
      baseUnit: "KG",
      secondaryUnit: "BAG",
      uomConversionFactor: new Decimal(0),
    };
    expect(() => toBaseUnit(5, material)).toThrow("zero UOM conversion factor");
  });

  it("handles fractional secondary quantities", () => {
    // 0.5 BAG × 50 = 25 KG
    expect(toBaseUnit(0.5, CEMENT).toNumber()).toBe(25);
  });

  it("handles large quantities (TON to KG)", () => {
    // 5 TON × 1000 = 5000 KG
    expect(toBaseUnit(5, STEEL).toNumber()).toBe(5000);
  });
});

describe("toSecondaryUnit", () => {
  it("converts base units to secondary units by dividing by factor", () => {
    // 150 KG / 50 = 3 BAG
    expect(toSecondaryUnit(150, CEMENT).toNumber()).toBe(3);
  });

  it("handles Decimal input", () => {
    expect(toSecondaryUnit(new Decimal(250), CEMENT).toNumber()).toBe(5);
  });

  it("handles string input", () => {
    expect(toSecondaryUnit("100", CEMENT).toNumber()).toBe(2);
  });

  it("returns qty unchanged when no secondary unit configured", () => {
    expect(toSecondaryUnit(100, SIMPLE).toNumber()).toBe(100);
  });

  it("throws when conversion factor is 0", () => {
    const material: UomMaterial = {
      baseUnit: "KG",
      secondaryUnit: "BAG",
      uomConversionFactor: new Decimal(0),
    };
    expect(() => toSecondaryUnit(100, material)).toThrow("zero UOM conversion factor");
  });

  it("handles non-evenly-divisible quantities", () => {
    // 175 KG / 50 = 3.5 BAG
    expect(toSecondaryUnit(175, CEMENT).toNumber()).toBe(3.5);
  });

  it("handles large quantities (KG to TON)", () => {
    // 5000 KG / 1000 = 5 TON
    expect(toSecondaryUnit(5000, STEEL).toNumber()).toBe(5);
  });
});

describe("displayQty", () => {
  it("shows both secondary and base units when conversion is configured", () => {
    // 150 KG → "3 BAG (150 KG)"
    expect(displayQty(150, CEMENT)).toBe("3 BAG (150 KG)");
  });

  it("shows only base unit when no conversion is configured", () => {
    expect(displayQty(100, SIMPLE)).toBe("100 PCS");
  });

  it("shows only base unit when secondary unit is null", () => {
    const material: UomMaterial = {
      baseUnit: "KG",
      secondaryUnit: null,
      uomConversionFactor: null,
    };
    expect(displayQty(50, material)).toBe("50 KG");
  });

  it("handles fractional secondary quantities in display", () => {
    // 175 KG → "3.5 BAG (175 KG)"
    expect(displayQty(175, CEMENT)).toBe("3.5 BAG (175 KG)");
  });

  it("handles Decimal input", () => {
    expect(displayQty(new Decimal(150), CEMENT)).toBe("3 BAG (150 KG)");
  });

  it("handles string input", () => {
    expect(displayQty("150", CEMENT)).toBe("3 BAG (150 KG)");
  });
});

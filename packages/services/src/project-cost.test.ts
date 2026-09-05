/**
 * Unit tests for the pure project cost helper.
 *
 *   validateProjectCostAmount — validate amount > 0
 */
import { describe, it, expect } from "vitest";
import { validateProjectCostAmount } from "./project-cost";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateProjectCostAmount", () => {
  it("passes for positive amount", () => {
    const r = validateProjectCostAmount(new Decimal(500));
    expect(r.toNumber()).toBe(500);
  });

  it("passes for string amount", () => {
    const r = validateProjectCostAmount("1000.50");
    expect(r.toNumber()).toBe(1000.5);
  });

  it("passes for number amount", () => {
    const r = validateProjectCostAmount(250);
    expect(r.toNumber()).toBe(250);
  });

  it("throws for zero amount", () => {
    expect(() => validateProjectCostAmount(new Decimal(0))).toThrow("Cost amount must be > 0");
  });

  it("throws for negative amount", () => {
    expect(() => validateProjectCostAmount(new Decimal(-100))).toThrow("Cost amount must be > 0");
  });

  it("throws for zero string amount", () => {
    expect(() => validateProjectCostAmount("0")).toThrow("Cost amount must be > 0");
  });

  it("throws for negative string amount", () => {
    expect(() => validateProjectCostAmount("-50")).toThrow("Cost amount must be > 0");
  });

  it("passes for very small positive amount", () => {
    const r = validateProjectCostAmount("0.01");
    expect(r.toNumber()).toBe(0.01);
  });
});

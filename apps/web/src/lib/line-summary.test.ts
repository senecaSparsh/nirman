import { describe, expect, it } from "vitest";
import { summarizeLines } from "./line-summary";

describe("summarizeLines", () => {
  it("returns null for no lines", () => {
    expect(summarizeLines([])).toBeNull();
  });

  it("names the single material with qty and unit", () => {
    expect(summarizeLines([{ name: "Cement PPC", qty: 50, unit: "BAG" }])).toBe("Cement PPC · 50 BAG");
  });

  it("counts the remaining lines", () => {
    expect(
      summarizeLines([
        { name: "Cement PPC", qty: 1500, unit: "BAG" },
        { name: "Sand", qty: 10, unit: "CUM" },
        { name: "Steel", qty: 2.5, unit: "T" },
      ]),
    ).toBe("Cement PPC · 1,500 BAG +2 more");
  });

  it("omits a missing unit", () => {
    expect(summarizeLines([{ name: "Labour", qty: 3, unit: null }])).toBe("Labour · 3");
  });
});

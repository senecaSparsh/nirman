/**
 * Unit tests for the pure scheduling helper in scheduling.ts.
 *
 *   addDays — add days to a date (returns new Date, doesn't mutate input)
 */
import { describe, it, expect } from "vitest";
import { addDays } from "./scheduling";

describe("addDays", () => {
  it("adds positive days to a date", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addDays(base, 7);
    expect(result.getDate()).toBe(11);
  });

  it("adds negative days (subtracts)", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addDays(base, -3);
    expect(result.getDate()).toBe(1);
  });

  it("returns the same date for 0 days", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const result = addDays(base, 0);
    expect(result.getTime()).toBe(base.getTime());
  });

  it("does not mutate the original date", () => {
    const base = new Date("2026-09-04T10:00:00Z");
    const originalTime = base.getTime();
    addDays(base, 10);
    expect(base.getTime()).toBe(originalTime);
  });

  it("handles month boundary", () => {
    const base = new Date("2026-09-30T10:00:00Z");
    const result = addDays(base, 1);
    expect(result.getMonth()).toBe(9); // October (0-indexed)
    expect(result.getDate()).toBe(1);
  });

  it("handles year boundary", () => {
    const base = new Date("2026-12-31T10:00:00Z");
    const result = addDays(base, 1);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });
});

/**
 * Unit tests for the pure notification handler helpers.
 *
 *   getIstHour   — compute IST hour from a UTC date
 *   isQuietHour  — check if an IST hour is within quiet hours (10 PM - 7 AM)
 */
import { describe, it, expect } from "vitest";
import { getIstHour, isQuietHour } from "./notification-handlers";

describe("getIstHour", () => {
  it("computes IST hour for UTC 00:00 (→ 05:30 IST)", () => {
    const date = new Date(Date.UTC(2024, 0, 1, 0, 0));
    expect(getIstHour(date)).toBeCloseTo(5.5, 2);
  });

  it("computes IST hour for UTC 18:00 (→ 23:30 IST)", () => {
    const date = new Date(Date.UTC(2024, 0, 1, 18, 0));
    expect(getIstHour(date)).toBeCloseTo(23.5, 2);
  });

  it("computes IST hour for UTC 16:30 (→ 21.5 IST — getUTCHours drops minutes)", () => {
    // Note: getUTCHours() returns only the hour (16), not 16.5.
    // So (16 + 5.5) % 24 = 21.5, NOT 22.0. This matches the original code.
    const date = new Date(Date.UTC(2024, 0, 1, 16, 30));
    expect(getIstHour(date)).toBeCloseTo(21.5, 2);
  });

  it("wraps around midnight (UTC 19:00 → 00:30 IST next day)", () => {
    const date = new Date(Date.UTC(2024, 0, 1, 19, 0));
    expect(getIstHour(date)).toBeCloseTo(0.5, 2);
  });

  it("computes IST hour for UTC 01:00 (→ 06:30 IST)", () => {
    const date = new Date(Date.UTC(2024, 0, 1, 1, 0));
    expect(getIstHour(date)).toBeCloseTo(6.5, 2);
  });

  it("computes IST hour for UTC 14:00 (→ 19:30 IST — not quiet)", () => {
    const date = new Date(Date.UTC(2024, 0, 1, 14, 0));
    expect(getIstHour(date)).toBeCloseTo(19.5, 2);
  });
});

describe("isQuietHour", () => {
  it("returns true for 22:00 (10 PM)", () => {
    expect(isQuietHour(22)).toBe(true);
  });

  it("returns true for 23:30 (11:30 PM)", () => {
    expect(isQuietHour(23.5)).toBe(true);
  });

  it("returns true for 00:30 (12:30 AM)", () => {
    expect(isQuietHour(0.5)).toBe(true);
  });

  it("returns true for 06:30 (6:30 AM)", () => {
    expect(isQuietHour(6.5)).toBe(true);
  });

  it("returns false for 07:00 (7 AM — boundary, not quiet)", () => {
    expect(isQuietHour(7)).toBe(false);
  });

  it("returns false for 21:59 (9:59 PM — not yet quiet)", () => {
    expect(isQuietHour(21.99)).toBe(false);
  });

  it("returns false for 12:00 (noon)", () => {
    expect(isQuietHour(12)).toBe(false);
  });

  it("returns false for 18:00 (6 PM)", () => {
    expect(isQuietHour(18)).toBe(false);
  });
});

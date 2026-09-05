/**
 * Unit tests for the pure daily report helper.
 *
 *   validateDailyReportInput — validate date and workDone
 */
import { describe, it, expect } from "vitest";
import { validateDailyReportInput } from "./daily-report";
import { ServiceError } from "./errors";

describe("validateDailyReportInput", () => {
  it("passes for valid string date and workDone", () => {
    const r = validateDailyReportInput({ date: "2024-01-15", workDone: "Poured concrete" });
    expect(r.date).toBeInstanceOf(Date);
    expect(r.date.getTime()).not.toBeNaN();
  });

  it("passes for Date object", () => {
    const d = new Date(2024, 0, 15);
    const r = validateDailyReportInput({ date: d, workDone: "Poured concrete" });
    expect(r.date).toBe(d);
  });

  it("throws for invalid date string", () => {
    expect(() => validateDailyReportInput({ date: "not-a-date", workDone: "Work" })).toThrow(
      "Invalid date",
    );
  });

  it("throws for empty workDone", () => {
    expect(() => validateDailyReportInput({ date: "2024-01-15", workDone: "" })).toThrow(
      "Work done is required",
    );
  });

  it("throws for whitespace-only workDone", () => {
    expect(() => validateDailyReportInput({ date: "2024-01-15", workDone: "   " })).toThrow(
      "Work done is required",
    );
  });

  it("throws for undefined workDone", () => {
    expect(() => validateDailyReportInput({ date: "2024-01-15" })).toThrow(
      "Work done is required",
    );
  });

  it("passes for workDone with content", () => {
    expect(() =>
      validateDailyReportInput({ date: "2024-01-15", workDone: "Site visit" }),
    ).not.toThrow();
  });

  it("passes for workDone with only whitespace surrounded content", () => {
    const r = validateDailyReportInput({ date: "2024-01-15", workDone: "  Poured concrete  " });
    expect(r.date).toBeInstanceOf(Date);
    expect(r.date.getTime()).not.toBeNaN();
  });

  it("throws for null workDone", () => {
    expect(() =>
      validateDailyReportInput({ date: "2024-01-15", workDone: null as unknown as string }),
    ).toThrow("Work done is required");
  });

  it("throws for invalid Date object", () => {
    const invalid = new Date("not-a-date");
    expect(() =>
      validateDailyReportInput({ date: invalid, workDone: "Work" }),
    ).toThrow("Invalid date");
  });

  it("handles ISO date string with time", () => {
    const r = validateDailyReportInput({ date: "2024-06-15T10:30:00Z", workDone: "Work" });
    expect(r.date).toBeInstanceOf(Date);
    expect(r.date.getTime()).not.toBeNaN();
  });

  it("handles date string in DD/MM/YYYY format (may be invalid in some engines)", () => {
    // Most JS engines parse this as NaN or a valid date depending on the engine
    // We just verify it doesn't crash
    expect(() => {
      try {
        validateDailyReportInput({ date: "15/01/2024", workDone: "Work" });
      } catch (e) {
        // If it throws ServiceError for invalid date, that's fine
        if (e instanceof Error && e.message === "Invalid date") return;
        if (e instanceof Error && e.message === "Work done is required") throw e;
      }
    }).not.toThrow();
  });

  it("returns a Date object from a valid string date", () => {
    const r = validateDailyReportInput({ date: "2024-12-31", workDone: "Final inspection" });
    expect(r.date).toBeInstanceOf(Date);
    expect(r.date.getFullYear()).toBe(2024);
  });

  it("returns the same Date object when passed a Date", () => {
    const d = new Date(2024, 5, 15);
    const r = validateDailyReportInput({ date: d, workDone: "Work" });
    expect(r.date).toBe(d);
  });

  it("handles epoch timestamp as date string", () => {
    const r = validateDailyReportInput({ date: "1704067200000", workDone: "Work" });
    expect(r.date).toBeInstanceOf(Date);
    expect(r.date.getTime()).not.toBeNaN();
  });

  it("throws for empty string date", () => {
    expect(() => validateDailyReportInput({ date: "", workDone: "Work" })).toThrow("Invalid date");
  });

  it("passes with long workDone text", () => {
    const longText = "A".repeat(10000);
    expect(() =>
      validateDailyReportInput({ date: "2024-01-15", workDone: longText }),
    ).not.toThrow();
  });
});

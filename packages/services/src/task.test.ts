import { describe, it, expect } from "vitest";
import { computeProgress, isBlocked, formatDuration, totalLoggedMinutes } from "./task";

describe("computeProgress", () => {
  it("returns 0 when there are no subtasks", () => {
    expect(computeProgress([])).toBe(0);
  });

  it("returns 0 when nothing is completed", () => {
    expect(computeProgress([{ completed: false }, { completed: false }])).toBe(0);
  });

  it("returns 100 when all completed", () => {
    expect(computeProgress([{ completed: true }, { completed: true }])).toBe(100);
  });

  it("rounds to nearest integer", () => {
    // 1 of 3 = 33.33 → 33
    expect(computeProgress([{ completed: true }, { completed: false }, { completed: false }])).toBe(33);
    // 2 of 3 = 66.67 → 67
    expect(computeProgress([{ completed: true }, { completed: true }, { completed: false }])).toBe(67);
  });

  it("handles a single subtask", () => {
    expect(computeProgress([{ completed: true }])).toBe(100);
    expect(computeProgress([{ completed: false }])).toBe(0);
  });
});

describe("isBlocked", () => {
  it("is not blocked with no dependencies", () => {
    expect(isBlocked([])).toBe(false);
  });

  it("is blocked when a blocker is pending", () => {
    expect(isBlocked([{ blocker: { status: "PENDING" } }])).toBe(true);
  });

  it("is blocked when a blocker is in progress", () => {
    expect(isBlocked([{ blocker: { status: "IN_PROGRESS" } }])).toBe(true);
  });

  it("is not blocked when all blockers are completed", () => {
    expect(isBlocked([{ blocker: { status: "COMPLETED" } }])).toBe(false);
  });

  it("is not blocked when a blocker is cancelled", () => {
    expect(isBlocked([{ blocker: { status: "CANCELLED" } }])).toBe(false);
  });

  it("is blocked if any one blocker is open", () => {
    expect(
      isBlocked([
        { blocker: { status: "COMPLETED" } },
        { blocker: { status: "PENDING" } },
      ]),
    ).toBe(true);
  });
});

describe("formatDuration", () => {
  it("handles zero and negative", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-5)).toBe("0m");
  });

  it("formats minutes only", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(5)).toBe("5m");
  });

  it("formats hours only", () => {
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(60)).toBe("1h");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(83)).toBe("1h 23m");
    expect(formatDuration(125)).toBe("2h 5m");
  });
});

describe("totalLoggedMinutes", () => {
  it("sums durations, treating null as 0", () => {
    expect(
      totalLoggedMinutes([
        { durationMins: 30 },
        { durationMins: null },
        { durationMins: 45 },
      ]),
    ).toBe(75);
  });

  it("returns 0 for empty list", () => {
    expect(totalLoggedMinutes([])).toBe(0);
  });
});

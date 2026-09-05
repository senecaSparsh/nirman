/**
 * Unit tests for the pure task helper functions in task.ts.
 *
 *   computeProgress      — % of completed subtasks
 *   isBlocked            — check if any dependency blocker is not done
 *   formatDuration       — human-readable elapsed time
 *   userName             — safe name extraction
 *   totalLoggedMinutes   — sum of time log durations
 */
import { describe, it, expect } from "vitest";
import {
  computeProgress,
  isBlocked,
  formatDuration,
  userName,
  totalLoggedMinutes,
} from "./task";

describe("computeProgress", () => {
  it("returns 0 for empty subtasks", () => {
    expect(computeProgress([])).toBe(0);
  });

  it("returns 0 when no subtasks are completed", () => {
    expect(computeProgress([{ completed: false }, { completed: false }])).toBe(0);
  });

  it("returns 100 when all subtasks are completed", () => {
    expect(computeProgress([{ completed: true }, { completed: true }])).toBe(100);
  });

  it("returns 50 when half are completed", () => {
    expect(computeProgress([{ completed: true }, { completed: false }])).toBe(50);
  });

  it("rounds to nearest integer", () => {
    // 1/3 = 33.33% → 33
    expect(computeProgress([{ completed: true }, { completed: false }, { completed: false }])).toBe(33);
    // 2/3 = 66.67% → 67
    expect(computeProgress([{ completed: true }, { completed: true }, { completed: false }])).toBe(67);
  });

  it("handles single subtask completed", () => {
    expect(computeProgress([{ completed: true }])).toBe(100);
  });

  it("handles single subtask not completed", () => {
    expect(computeProgress([{ completed: false }])).toBe(0);
  });
});

describe("isBlocked", () => {
  it("returns false for empty dependencies", () => {
    expect(isBlocked([])).toBe(false);
  });

  it("returns false when all blockers are COMPLETED", () => {
    expect(isBlocked([
      { blocker: { status: "COMPLETED" } },
      { blocker: { status: "COMPLETED" } },
    ])).toBe(false);
  });

  it("returns false when all blockers are CANCELLED", () => {
    expect(isBlocked([
      { blocker: { status: "CANCELLED" } },
    ])).toBe(false);
  });

  it("returns true when any blocker is IN_PROGRESS", () => {
    expect(isBlocked([
      { blocker: { status: "COMPLETED" } },
      { blocker: { status: "IN_PROGRESS" } },
    ])).toBe(true);
  });

  it("returns true when any blocker is TODO", () => {
    expect(isBlocked([
      { blocker: { status: "TODO" } },
    ])).toBe(true);
  });

  it("returns true when all blockers are not done", () => {
    expect(isBlocked([
      { blocker: { status: "TODO" } },
      { blocker: { status: "IN_PROGRESS" } },
    ])).toBe(true);
  });

  it("returns false for mixed COMPLETED and CANCELLED", () => {
    expect(isBlocked([
      { blocker: { status: "COMPLETED" } },
      { blocker: { status: "CANCELLED" } },
    ])).toBe(false);
  });
});

describe("formatDuration", () => {
  it("returns '0m' for 0 minutes", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("returns '0m' for negative minutes", () => {
    expect(formatDuration(-10)).toBe("0m");
  });

  it("formats minutes only", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("formats hours only", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(83)).toBe("1h 23m");
  });

  it("formats 1 hour exactly", () => {
    expect(formatDuration(60)).toBe("1h");
  });

  it("rounds minutes", () => {
    // 90.7 minutes → 1h 31m (rounded)
    expect(formatDuration(90.7)).toBe("1h 31m");
  });

  it("formats large durations", () => {
    expect(formatDuration(600)).toBe("10h");
  });
});

describe("userName", () => {
  it("returns the name when user is provided", () => {
    expect(userName({ name: "Alice" })).toBe("Alice");
  });

  it("returns 'Someone' for null", () => {
    expect(userName(null)).toBe("Someone");
  });

  it("returns 'Someone' for undefined", () => {
    expect(userName(undefined)).toBe("Someone");
  });
});

describe("totalLoggedMinutes", () => {
  it("returns 0 for empty logs", () => {
    expect(totalLoggedMinutes([])).toBe(0);
  });

  it("sums all durations", () => {
    expect(totalLoggedMinutes([
      { durationMins: 30 },
      { durationMins: 45 },
      { durationMins: 60 },
    ])).toBe(135);
  });

  it("treats null duration as 0", () => {
    expect(totalLoggedMinutes([
      { durationMins: 30 },
      { durationMins: null },
      { durationMins: 45 },
    ])).toBe(75);
  });

  it("handles all null durations", () => {
    expect(totalLoggedMinutes([
      { durationMins: null },
      { durationMins: null },
    ])).toBe(0);
  });

  it("handles single log", () => {
    expect(totalLoggedMinutes([{ durationMins: 120 }])).toBe(120);
  });
});

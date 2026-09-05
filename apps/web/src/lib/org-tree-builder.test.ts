/**
 * Unit tests for org tree builder pure helpers.
 *
 *   computeTaskSummary — count tasks by status, overdue, due today
 */
import { describe, it, expect } from "vitest";
import { computeTaskSummary } from "./org-tree-builder";

describe("computeTaskSummary", () => {
  const now = new Date("2026-01-15T12:00:00Z");
  const todayStart = new Date(Date.UTC(2026, 0, 15));
  const todayEnd = new Date("2026-01-15T23:59:59.999Z");
  const yesterday = new Date("2026-01-14T12:00:00Z");
  const tomorrow = new Date("2026-01-16T12:00:00Z");

  it("returns all zeros for empty tasks", () => {
    const summary = computeTaskSummary([], now);
    expect(summary).toEqual({ pending: 0, inProgress: 0, completed: 0, overdue: 0, dueToday: 0 });
  });

  it("counts pending tasks", () => {
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: null }, { status: "PENDING", dueDate: null }],
      now,
    );
    expect(summary.pending).toBe(2);
  });

  it("counts in-progress tasks", () => {
    const summary = computeTaskSummary(
      [{ status: "IN_PROGRESS", dueDate: null }],
      now,
    );
    expect(summary.inProgress).toBe(1);
  });

  it("counts completed tasks", () => {
    const summary = computeTaskSummary(
      [{ status: "COMPLETED", dueDate: null }],
      now,
    );
    expect(summary.completed).toBe(1);
  });

  it("counts overdue tasks (PENDING with past dueDate)", () => {
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: yesterday }],
      now,
    );
    expect(summary.overdue).toBe(1);
  });

  it("counts overdue tasks (IN_PROGRESS with past dueDate)", () => {
    const summary = computeTaskSummary(
      [{ status: "IN_PROGRESS", dueDate: yesterday }],
      now,
    );
    expect(summary.overdue).toBe(1);
  });

  it("does NOT count completed tasks as overdue even if past dueDate", () => {
    const summary = computeTaskSummary(
      [{ status: "COMPLETED", dueDate: yesterday }],
      now,
    );
    expect(summary.overdue).toBe(0);
  });

  it("counts dueToday tasks (PENDING with dueDate today)", () => {
    const todayDue = new Date("2026-01-15T10:00:00Z");
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: todayDue }],
      now,
    );
    expect(summary.dueToday).toBe(1);
  });

  it("does NOT count tomorrow as dueToday", () => {
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: tomorrow }],
      now,
    );
    expect(summary.dueToday).toBe(0);
  });

  it("does NOT count yesterday as dueToday", () => {
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: yesterday }],
      now,
    );
    expect(summary.dueToday).toBe(0);
  });

  it("handles null dueDate (not overdue, not dueToday)", () => {
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: null }],
      now,
    );
    expect(summary.overdue).toBe(0);
    expect(summary.dueToday).toBe(0);
  });

  it("handles mixed task statuses", () => {
    // Use a later time today so it's not overdue
    const laterToday = new Date("2026-01-15T18:00:00Z");
    const summary = computeTaskSummary(
      [
        { status: "PENDING", dueDate: yesterday },      // overdue + pending
        { status: "IN_PROGRESS", dueDate: laterToday }, // dueToday + inProgress (not overdue, future)
        { status: "COMPLETED", dueDate: null },         // completed
        { status: "PENDING", dueDate: tomorrow },       // pending (not overdue, not today)
      ],
      now,
    );
    expect(summary.pending).toBe(2);
    expect(summary.inProgress).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
  });

  it("a task can be both overdue AND dueToday (edge case: dueDate passed today)", () => {
    // A task due at 8am today, and now is 12pm — it's overdue AND dueToday
    const pastToday = new Date("2026-01-15T08:00:00Z");
    const summary = computeTaskSummary(
      [{ status: "PENDING", dueDate: pastToday }],
      now,
    );
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
  });

  it("ignores unknown status values", () => {
    const summary = computeTaskSummary(
      [{ status: "UNKNOWN", dueDate: null }],
      now,
    );
    expect(summary.pending).toBe(0);
    expect(summary.inProgress).toBe(0);
    expect(summary.completed).toBe(0);
  });
});

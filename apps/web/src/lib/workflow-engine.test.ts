/**
 * Unit tests for workflow engine pure helpers.
 *
 *   evaluateCondition — evaluate a condition operator against field/value
 *   findNextStep      — find the next edge to follow from a step
 */
import { describe, it, expect } from "vitest";
import { evaluateCondition, findNextStep, nextRunFromCron } from "./workflow-engine";
import type { WorkflowEdge } from "./workflow-engine";

describe("evaluateCondition", () => {
  it("eq returns true when values match", () => {
    expect(evaluateCondition("eq", "APPROVED", "APPROVED")).toBe(true);
  });

  it("eq returns false when values differ", () => {
    expect(evaluateCondition("eq", "DRAFT", "APPROVED")).toBe(false);
  });

  it("ne returns true when values differ", () => {
    expect(evaluateCondition("ne", "DRAFT", "APPROVED")).toBe(true);
  });

  it("ne returns false when values match", () => {
    expect(evaluateCondition("ne", "APPROVED", "APPROVED")).toBe(false);
  });

  it("gt returns true when fieldValue > value", () => {
    expect(evaluateCondition("gt", "100", "50")).toBe(true);
  });

  it("gt returns false when fieldValue = value", () => {
    expect(evaluateCondition("gt", "100", "100")).toBe(false);
  });

  it("gt returns false when fieldValue < value", () => {
    expect(evaluateCondition("gt", "50", "100")).toBe(false);
  });

  it("lt returns true when fieldValue < value", () => {
    expect(evaluateCondition("lt", "50", "100")).toBe(true);
  });

  it("lt returns false when fieldValue = value", () => {
    expect(evaluateCondition("lt", "100", "100")).toBe(false);
  });

  it("lt returns false when fieldValue > value", () => {
    expect(evaluateCondition("lt", "100", "50")).toBe(false);
  });

  it("contains returns true when fieldValue includes value", () => {
    expect(evaluateCondition("contains", "hello world", "world")).toBe(true);
  });

  it("contains returns false when fieldValue does not include value", () => {
    expect(evaluateCondition("contains", "hello", "world")).toBe(false);
  });

  it("unknown operator returns false", () => {
    expect(evaluateCondition("unknown", "abc", "abc")).toBe(false);
  });

  it("handles numeric comparison with decimals", () => {
    expect(evaluateCondition("gt", "99.5", "99.4")).toBe(true);
    expect(evaluateCondition("lt", "99.4", "99.5")).toBe(true);
  });

  it("handles empty strings", () => {
    expect(evaluateCondition("eq", "", "")).toBe(true);
    expect(evaluateCondition("contains", "", "")).toBe(true);
  });
});

describe("nextRunFromCron", () => {
  const from = new Date("2026-09-24T10:30:00"); // Thursday

  it("every-minute cron fires next minute", () => {
    const next = nextRunFromCron("* * * * *", from)!;
    expect(next.getTime()).toBe(new Date("2026-09-24T10:31:00").getTime());
  });

  it("fixed daily time fires same day when future", () => {
    const next = nextRunFromCron("0 9 * * *", from)!;
    expect(next.getHours()).toBe(9);
    expect(next.getDate()).toBe(25); // 9am already passed → tomorrow
  });

  it("fixed daily time fires same day when not yet reached", () => {
    const next = nextRunFromCron("0 22 * * *", from)!;
    expect(next.getDate()).toBe(24);
    expect(next.getHours()).toBe(22);
  });

  it("weekly Monday cron skips to Monday", () => {
    const next = nextRunFromCron("0 9 * * 1", from)!;
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(28); // Thursday Sep 24 → Monday Sep 28
  });

  it("step values work (*/15)", () => {
    const next = nextRunFromCron("*/15 * * * *", from)!;
    expect(next.getMinutes()).toBe(45); // 10:30 → 10:45
  });

  it("lists work", () => {
    const next = nextRunFromCron("0 8,20 * * *", from)!;
    expect(next.getHours()).toBe(20); // 8am passed → 8pm today
  });

  it("dom+dow is OR'd (Vixie semantics)", () => {
    // "0 9 1 * 4" = 9am on the 1st OR any Thursday
    const next = nextRunFromCron("0 9 1 * 4", new Date("2026-09-24T08:00:00"))!;
    expect(next.getDay()).toBe(4); // today is Thursday → fires today at 9
  });

  it("dom alone respects month boundaries", () => {
    const next = nextRunFromCron("0 9 1 * *", from)!;
    expect(next.getDate()).toBe(1);
    expect(next.getMonth()).toBe(9); // Oct 1
  });

  it("returns null for malformed expressions", () => {
    expect(nextRunFromCron("not a cron", from)).toBeNull();
    expect(nextRunFromCron("* * *", from)).toBeNull();
  });
});

/**
 * Unit tests for the pure feedback helpers.
 *
 *   validateFeedbackMessage       — validate message is non-empty and ≤ 5000 chars
 *   isFeedbackTransitionAllowed   — validate status transitions
 */
import { describe, it, expect } from "vitest";
import { validateFeedbackMessage, isFeedbackTransitionAllowed } from "./feedback";
import { ServiceError } from "./errors";

describe("validateFeedbackMessage", () => {
  it("passes for valid message", () => {
    expect(() => validateFeedbackMessage("This is a bug report")).not.toThrow();
  });

  it("throws for empty string", () => {
    expect(() => validateFeedbackMessage("")).toThrow("cannot be empty");
  });

  it("throws for whitespace-only string", () => {
    expect(() => validateFeedbackMessage("   ")).toThrow("cannot be empty");
  });

  it("throws for message exceeding 5000 characters", () => {
    const long = "a".repeat(5001);
    expect(() => validateFeedbackMessage(long)).toThrow("too long");
  });

  it("passes for message exactly 5000 characters", () => {
    const exact = "a".repeat(5000);
    expect(() => validateFeedbackMessage(exact)).not.toThrow();
  });
});

describe("isFeedbackTransitionAllowed", () => {
  it("allows NEW → READ", () => {
    expect(isFeedbackTransitionAllowed("NEW", "READ")).toBe(true);
  });

  it("allows NEW → ARCHIVED", () => {
    expect(isFeedbackTransitionAllowed("NEW", "ARCHIVED")).toBe(true);
  });

  it("allows READ → RESOLVED", () => {
    expect(isFeedbackTransitionAllowed("READ", "RESOLVED")).toBe(true);
  });

  it("allows READ → ARCHIVED", () => {
    expect(isFeedbackTransitionAllowed("READ", "ARCHIVED")).toBe(true);
  });

  it("allows RESOLVED → ARCHIVED", () => {
    expect(isFeedbackTransitionAllowed("RESOLVED", "ARCHIVED")).toBe(true);
  });

  it("allows RESOLVED → READ (reopen)", () => {
    expect(isFeedbackTransitionAllowed("RESOLVED", "READ")).toBe(true);
  });

  it("disallows ARCHIVED → any (terminal)", () => {
    expect(isFeedbackTransitionAllowed("ARCHIVED", "NEW")).toBe(false);
    expect(isFeedbackTransitionAllowed("ARCHIVED", "READ")).toBe(false);
  });

  it("disallows NEW → RESOLVED (must read first)", () => {
    expect(isFeedbackTransitionAllowed("NEW", "RESOLVED")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isFeedbackTransitionAllowed("NEW", "NEW")).toBe(true);
    expect(isFeedbackTransitionAllowed("ARCHIVED", "ARCHIVED")).toBe(true);
  });
});

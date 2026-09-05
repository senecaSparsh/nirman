/**
 * Unit tests for the pure gate pass helper.
 *
 *   isGatePassTransitionAllowed — validate status transitions
 *
 * Workflow: DRAFT → PENDING → APPROVED → EXITED
 *                  → REJECTED     → CANCELLED
 */
import { describe, it, expect } from "vitest";
import { isGatePassTransitionAllowed } from "./gate-pass";

describe("isGatePassTransitionAllowed", () => {
  it("allows DRAFT → PENDING (submit)", () => {
    expect(isGatePassTransitionAllowed("DRAFT", "PENDING")).toBe(true);
  });

  it("allows DRAFT → CANCELLED", () => {
    expect(isGatePassTransitionAllowed("DRAFT", "CANCELLED")).toBe(true);
  });

  it("disallows DRAFT → APPROVED (must submit first)", () => {
    expect(isGatePassTransitionAllowed("DRAFT", "APPROVED")).toBe(false);
  });

  it("allows PENDING → APPROVED", () => {
    expect(isGatePassTransitionAllowed("PENDING", "APPROVED")).toBe(true);
  });

  it("allows PENDING → REJECTED", () => {
    expect(isGatePassTransitionAllowed("PENDING", "REJECTED")).toBe(true);
  });

  it("allows PENDING → CANCELLED", () => {
    expect(isGatePassTransitionAllowed("PENDING", "CANCELLED")).toBe(true);
  });

  it("allows REJECTED → PENDING (resubmit)", () => {
    expect(isGatePassTransitionAllowed("REJECTED", "PENDING")).toBe(true);
  });

  it("allows APPROVED → EXITED (security confirms)", () => {
    expect(isGatePassTransitionAllowed("APPROVED", "EXITED")).toBe(true);
  });

  it("disallows APPROVED → CANCELLED (items cleared to leave)", () => {
    expect(isGatePassTransitionAllowed("APPROVED", "CANCELLED")).toBe(false);
  });

  it("disallows EXITED → any (terminal)", () => {
    expect(isGatePassTransitionAllowed("EXITED", "DRAFT")).toBe(false);
    expect(isGatePassTransitionAllowed("EXITED", "APPROVED")).toBe(false);
  });

  it("disallows CANCELLED → any (terminal)", () => {
    expect(isGatePassTransitionAllowed("CANCELLED", "DRAFT")).toBe(false);
  });

  it("disallows REJECTED → APPROVED (must resubmit first)", () => {
    expect(isGatePassTransitionAllowed("REJECTED", "APPROVED")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isGatePassTransitionAllowed("DRAFT", "DRAFT")).toBe(true);
    expect(isGatePassTransitionAllowed("EXITED", "EXITED")).toBe(true);
  });
});

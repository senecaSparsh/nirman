/**
 * Unit tests for the pure quality control helpers in quality-control.ts.
 *
 *   isNcrTransitionAllowed  — validate NCR status transitions
 *   isCapaTransitionAllowed — validate CAPA status transitions
 */
import { describe, it, expect } from "vitest";
import { isNcrTransitionAllowed, isCapaTransitionAllowed } from "./quality-control";

describe("isNcrTransitionAllowed", () => {
  it("allows OPEN → UNDER_REVIEW", () => {
    expect(isNcrTransitionAllowed("OPEN", "UNDER_REVIEW")).toBe(true);
  });

  it("allows OPEN → CANCELLED", () => {
    expect(isNcrTransitionAllowed("OPEN", "CANCELLED")).toBe(true);
  });

  it("disallows OPEN → CLOSED (must go through review)", () => {
    expect(isNcrTransitionAllowed("OPEN", "CLOSED")).toBe(false);
  });

  it("allows UNDER_REVIEW → CAPA_REQUIRED", () => {
    expect(isNcrTransitionAllowed("UNDER_REVIEW", "CAPA_REQUIRED")).toBe(true);
  });

  it("allows UNDER_REVIEW → ACCEPTED", () => {
    expect(isNcrTransitionAllowed("UNDER_REVIEW", "ACCEPTED")).toBe(true);
  });

  it("allows UNDER_REVIEW → REJECTED", () => {
    expect(isNcrTransitionAllowed("UNDER_REVIEW", "REJECTED")).toBe(true);
  });

  it("allows UNDER_REVIEW → OPEN (send back)", () => {
    expect(isNcrTransitionAllowed("UNDER_REVIEW", "OPEN")).toBe(true);
  });

  it("allows CAPA_REQUIRED → CLOSED", () => {
    expect(isNcrTransitionAllowed("CAPA_REQUIRED", "CLOSED")).toBe(true);
  });

  it("allows ACCEPTED → CLOSED", () => {
    expect(isNcrTransitionAllowed("ACCEPTED", "CLOSED")).toBe(true);
  });

  it("allows REJECTED → CLOSED", () => {
    expect(isNcrTransitionAllowed("REJECTED", "CLOSED")).toBe(true);
  });

  it("disallows CLOSED → any (terminal)", () => {
    expect(isNcrTransitionAllowed("CLOSED", "OPEN")).toBe(false);
    expect(isNcrTransitionAllowed("CLOSED", "UNDER_REVIEW")).toBe(false);
  });

  it("disallows CANCELLED → any (terminal)", () => {
    expect(isNcrTransitionAllowed("CANCELLED", "OPEN")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isNcrTransitionAllowed("OPEN", "OPEN")).toBe(true);
    expect(isNcrTransitionAllowed("CLOSED", "CLOSED")).toBe(true);
  });
});

describe("isCapaTransitionAllowed", () => {
  it("allows DRAFT → IN_PROGRESS", () => {
    expect(isCapaTransitionAllowed("DRAFT", "IN_PROGRESS")).toBe(true);
  });

  it("disallows DRAFT → VERIFICATION (must start first)", () => {
    expect(isCapaTransitionAllowed("DRAFT", "VERIFICATION")).toBe(false);
  });

  it("allows IN_PROGRESS → VERIFICATION", () => {
    expect(isCapaTransitionAllowed("IN_PROGRESS", "VERIFICATION")).toBe(true);
  });

  it("allows VERIFICATION → VERIFIED", () => {
    expect(isCapaTransitionAllowed("VERIFICATION", "VERIFIED")).toBe(true);
  });

  it("allows VERIFICATION → REJECTED", () => {
    expect(isCapaTransitionAllowed("VERIFICATION", "REJECTED")).toBe(true);
  });

  it("allows VERIFIED → CLOSED", () => {
    expect(isCapaTransitionAllowed("VERIFIED", "CLOSED")).toBe(true);
  });

  it("allows REJECTED → IN_PROGRESS (rework)", () => {
    expect(isCapaTransitionAllowed("REJECTED", "IN_PROGRESS")).toBe(true);
  });

  it("disallows CLOSED → any (terminal)", () => {
    expect(isCapaTransitionAllowed("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(isCapaTransitionAllowed("CLOSED", "VERIFICATION")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isCapaTransitionAllowed("DRAFT", "DRAFT")).toBe(true);
    expect(isCapaTransitionAllowed("CLOSED", "CLOSED")).toBe(true);
  });
});

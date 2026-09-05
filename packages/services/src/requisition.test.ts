/**
 * Unit tests for the pure requisition helpers in requisition.ts.
 *
 *   validateRequisitionInput       — validate input before DB operations
 *   isRequisitionTransitionAllowed — validate status transitions
 */
import { describe, it, expect } from "vitest";
import { validateRequisitionInput, isRequisitionTransitionAllowed } from "./requisition";
import { ServiceError } from "./errors";
import Decimal from "decimal.js";

describe("validateRequisitionInput", () => {
  it("passes for valid project-scoped requisition", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: 10 }],
      }),
    ).not.toThrow();
  });

  it("passes for valid department-scoped requisition", () => {
    expect(() =>
      validateRequisitionInput({
        departmentId: "d1",
        lines: [{ qtyRequested: 10 }],
      }),
    ).not.toThrow();
  });

  it("throws when lines array is empty", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [],
      }),
    ).toThrow("at least one line");
  });

  it("throws when neither projectId nor departmentId is set", () => {
    expect(() =>
      validateRequisitionInput({
        lines: [{ qtyRequested: 10 }],
      }),
    ).toThrow("Either projectId or departmentId");
  });

  it("throws when qtyRequested is 0", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: 0 }],
      }),
    ).toThrow("Requested qty must be > 0");
  });

  it("throws when qtyRequested is negative", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: -5 }],
      }),
    ).toThrow("Requested qty must be > 0");
  });

  it("accepts Decimal qtyRequested", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: new Decimal(10) }],
      }),
    ).not.toThrow();
  });

  it("accepts string qtyRequested", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: "10" }],
      }),
    ).not.toThrow();
  });

  it("throws for string zero qty", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: "0" }],
      }),
    ).toThrow("Requested qty must be > 0");
  });

  it("validates all lines (throws on second line with 0 qty)", () => {
    expect(() =>
      validateRequisitionInput({
        projectId: "p1",
        lines: [{ qtyRequested: 10 }, { qtyRequested: 0 }],
      }),
    ).toThrow("Requested qty must be > 0");
  });
});

describe("isRequisitionTransitionAllowed", () => {
  it("allows DRAFT → SUBMITTED", () => {
    expect(isRequisitionTransitionAllowed("DRAFT", "SUBMITTED")).toBe(true);
  });

  it("disallows DRAFT → APPROVED (must submit first)", () => {
    expect(isRequisitionTransitionAllowed("DRAFT", "APPROVED")).toBe(false);
  });

  it("allows SUBMITTED → APPROVED", () => {
    expect(isRequisitionTransitionAllowed("SUBMITTED", "APPROVED")).toBe(true);
  });

  it("allows SUBMITTED → REJECTED", () => {
    expect(isRequisitionTransitionAllowed("SUBMITTED", "REJECTED")).toBe(true);
  });

  it("allows APPROVED → CONVERTED", () => {
    expect(isRequisitionTransitionAllowed("APPROVED", "CONVERTED")).toBe(true);
  });

  it("allows REJECTED → DRAFT (re-submit after rejection)", () => {
    expect(isRequisitionTransitionAllowed("REJECTED", "DRAFT")).toBe(true);
  });

  it("disallows CONVERTED → any (terminal)", () => {
    expect(isRequisitionTransitionAllowed("CONVERTED", "DRAFT")).toBe(false);
    expect(isRequisitionTransitionAllowed("CONVERTED", "APPROVED")).toBe(false);
  });

  it("disallows REJECTED → APPROVED (must go back to DRAFT first)", () => {
    expect(isRequisitionTransitionAllowed("REJECTED", "APPROVED")).toBe(false);
  });

  it("allows same-stage transitions (no-op)", () => {
    expect(isRequisitionTransitionAllowed("DRAFT", "DRAFT")).toBe(true);
    expect(isRequisitionTransitionAllowed("APPROVED", "APPROVED")).toBe(true);
  });
});

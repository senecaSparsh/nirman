/**
 * Unit tests for the pure legal docs helper in legal-docs.ts.
 *
 *   shouldHaveTransferDutyCost — check if a legal doc should create a project cost line
 */
import { describe, it, expect } from "vitest";
import { shouldHaveTransferDutyCost } from "./legal-docs";
import Decimal from "decimal.js";

describe("shouldHaveTransferDutyCost", () => {
  it("returns true when all conditions are met", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "APPROVED",
        amount: 50000,
        projectId: "p1",
      }),
    ).toBe(true);
  });

  it("returns false when type is not TRANSFER_DUTY", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "BUILDING_PERMISSION",
        obtained: true,
        status: "APPROVED",
        amount: 50000,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("returns false when not obtained", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: false,
        status: "APPROVED",
        amount: 50000,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("returns false when status is not APPROVED", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "PENDING",
        amount: 50000,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("returns false when amount is null", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "APPROVED",
        amount: null,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("returns false when amount is 0", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "APPROVED",
        amount: 0,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("returns false when projectId is null", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "APPROVED",
        amount: 50000,
        projectId: null,
      }),
    ).toBe(false);
  });

  it("accepts Decimal amount", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "APPROVED",
        amount: new Decimal(50000),
        projectId: "p1",
      }),
    ).toBe(true);
  });

  it("returns false when amount is negative", () => {
    expect(
      shouldHaveTransferDutyCost({
        type: "TRANSFER_DUTY",
        obtained: true,
        status: "APPROVED",
        amount: -100,
        projectId: "p1",
      }),
    ).toBe(false);
  });
});

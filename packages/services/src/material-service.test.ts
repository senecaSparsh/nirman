/**
 * Unit tests for the pure material service helper.
 *
 *   determineAutoFillAction — decide HSN/GST auto-fill strategy
 */
import { describe, it, expect } from "vitest";
import { determineAutoFillAction } from "./material-service";
import Decimal from "decimal.js";

describe("determineAutoFillAction", () => {
  it("returns lookup_by_hsn when HSN is set but GST is 0", () => {
    expect(determineAutoFillAction("7224", new Decimal(0))).toBe("lookup_by_hsn");
  });

  it("returns suggest_from_name when neither HSN nor GST is set", () => {
    expect(determineAutoFillAction(null, new Decimal(0))).toBe("suggest_from_name");
  });

  it("returns already_set when both HSN and GST are set", () => {
    expect(determineAutoFillAction("7224", new Decimal(18))).toBe("already_set");
  });

  it("returns no_action when GST is set but HSN is null", () => {
    expect(determineAutoFillAction(null, new Decimal(18))).toBe("no_action");
  });

  it("returns no_action when GST is set but HSN is empty string", () => {
    expect(determineAutoFillAction("", new Decimal(18))).toBe("no_action");
  });

  it("handles GST rate of 0 with empty string HSN (suggest_from_name)", () => {
    // Empty string is falsy → treated as no HSN
    expect(determineAutoFillAction("", new Decimal(0))).toBe("suggest_from_name");
  });
});

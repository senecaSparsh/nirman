/**
 * Unit tests for the pure transaction helpers.
 *
 *   isRetryableTransactionError — detect retryable DB errors
 *   computeRetryBackoff         — exponential backoff base delay
 */
import { describe, it, expect } from "vitest";
import { isRetryableTransactionError, computeRetryBackoff } from "./transaction";

describe("isRetryableTransactionError", () => {
  it("returns true for write conflict message", () => {
    expect(isRetryableTransactionError(new Error("write conflict"))).toBe(true);
  });

  it("returns true for deadlock message", () => {
    expect(isRetryableTransactionError(new Error("deadlock detected"))).toBe(true);
  });

  it("returns true for could not serialize message", () => {
    expect(isRetryableTransactionError(new Error("could not serialize access"))).toBe(true);
  });

  it("returns true for P2002 code (unique constraint)", () => {
    const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    expect(isRetryableTransactionError(err)).toBe(true);
  });

  it("returns false for non-retryable error", () => {
    expect(isRetryableTransactionError(new Error("Connection refused"))).toBe(false);
  });

  it("returns false for P2003 code (foreign key constraint)", () => {
    const err = Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });
    expect(isRetryableTransactionError(err)).toBe(false);
  });

  it("returns false for generic Error without code", () => {
    expect(isRetryableTransactionError(new Error("Some random error"))).toBe(false);
  });

  it("handles non-Error values", () => {
    expect(isRetryableTransactionError("write conflict")).toBe(true);
    expect(isRetryableTransactionError("some string")).toBe(false);
    expect(isRetryableTransactionError(null)).toBe(false);
    expect(isRetryableTransactionError(undefined)).toBe(false);
  });

  it("handles object with code but no message", () => {
    const err = { code: "P2002" };
    expect(isRetryableTransactionError(err)).toBe(true);
  });
});

describe("computeRetryBackoff", () => {
  it("computes 100ms for attempt 0", () => {
    expect(computeRetryBackoff(0)).toBe(100);
  });

  it("computes 200ms for attempt 1", () => {
    expect(computeRetryBackoff(1)).toBe(200);
  });

  it("computes 400ms for attempt 2", () => {
    expect(computeRetryBackoff(2)).toBe(400);
  });

  it("computes 800ms for attempt 3", () => {
    expect(computeRetryBackoff(3)).toBe(800);
  });

  it("computes 1600ms for attempt 4", () => {
    expect(computeRetryBackoff(4)).toBe(1600);
  });

  it("doubles each attempt (exponential)", () => {
    expect(computeRetryBackoff(1) / computeRetryBackoff(0)).toBe(2);
    expect(computeRetryBackoff(2) / computeRetryBackoff(1)).toBe(2);
    expect(computeRetryBackoff(3) / computeRetryBackoff(2)).toBe(2);
  });
});

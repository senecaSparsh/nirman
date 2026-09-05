/**
 * Unit tests for the pure sequence helper.
 *
 *   formatSeqNumber — format a sequence number with prefix and zero-padding
 */
import { describe, it, expect } from "vitest";
import { formatSeqNumber } from "./sequence";

describe("formatSeqNumber", () => {
  it("formats first sequence with default 4-digit padding", () => {
    expect(formatSeqNumber("PO-20260904-", 1)).toBe("PO-20260904-0001");
  });

  it("formats 42 with default 4-digit padding", () => {
    expect(formatSeqNumber("PO-20260904-", 42)).toBe("PO-20260904-0042");
  });

  it("formats 9999 with default 4-digit padding (max 4-digit)", () => {
    expect(formatSeqNumber("PO-20260904-", 9999)).toBe("PO-20260904-9999");
  });

  it("does not truncate when number exceeds pad length", () => {
    expect(formatSeqNumber("PO-20260904-", 10000)).toBe("PO-20260904-10000");
  });

  it("formats with custom pad length of 6", () => {
    expect(formatSeqNumber("REQ-", 1, 6)).toBe("REQ-000001");
  });

  it("formats with pad length of 2", () => {
    expect(formatSeqNumber("GP-", 5, 2)).toBe("GP-05");
  });

  it("formats with pad length of 0 (no padding)", () => {
    expect(formatSeqNumber("INV-", 42, 0)).toBe("INV-42");
  });

  it("handles empty prefix", () => {
    expect(formatSeqNumber("", 1, 4)).toBe("0001");
  });

  it("handles large numbers", () => {
    expect(formatSeqNumber("PO-", 123456, 6)).toBe("PO-123456");
  });
});

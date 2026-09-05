/**
 * Unit tests for phone OTP helpers.
 *
 *   normalizePhone — strip everything except digits
 *   generateOtpCode — 6-digit zero-padded code
 *   OTP_CONFIG — config constants
 */
import { describe, it, expect } from "vitest";
import { normalizePhone, generateOtpCode, OTP_CONFIG } from "./phone-otp";

describe("normalizePhone", () => {
  it("strips non-digit characters", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("919876543210");
  });

  it("strips dashes", () => {
    expect(normalizePhone("98765-43210")).toBe("9876543210");
  });

  it("strips spaces", () => {
    expect(normalizePhone("98 76 54 32 10")).toBe("9876543210");
  });

  it("strips parentheses", () => {
    expect(normalizePhone("(91) 9876543210")).toBe("919876543210");
  });

  it("preserves only digits", () => {
    expect(normalizePhone("1234567890")).toBe("1234567890");
  });

  it("returns empty string for non-digit input", () => {
    expect(normalizePhone("abc")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("handles mixed input with letters and digits", () => {
    expect(normalizePhone("call 9876543210 now")).toBe("9876543210");
  });
});

describe("generateOtpCode", () => {
  it("returns a 6-digit string", () => {
    const code = generateOtpCode();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it("is zero-padded", () => {
    // Run multiple times to check for zero-padding
    for (let i = 0; i < 100; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("generates different codes (high probability)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateOtpCode());
    }
    // With 1M possible codes, 100 draws should produce mostly unique codes
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe("OTP_CONFIG", () => {
  it("has TTL of 5 minutes", () => {
    expect(OTP_CONFIG.TTL_MINUTES).toBe(5);
  });

  it("has max 5 attempts", () => {
    expect(OTP_CONFIG.MAX_ATTEMPTS).toBe(5);
  });

  it("has code length of 6", () => {
    expect(OTP_CONFIG.CODE_LENGTH).toBe(6);
  });
});

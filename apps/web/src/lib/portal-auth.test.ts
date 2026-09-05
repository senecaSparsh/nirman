/**
 * Unit tests for portal auth helpers.
 *
 *   signPortalCookie  — sign a customer ID with HMAC-SHA256
 *   verifyPortalCookie — verify a signed cookie value
 */
import { describe, it, expect } from "vitest";
import {
  signPortalCookie,
  verifyPortalCookie,
  PORTAL_COOKIE_NAME,
  PORTAL_COOKIE_MAX_AGE,
} from "./portal-auth";

describe("signPortalCookie / verifyPortalCookie", () => {
  it("signs and verifies a customer ID round-trip", () => {
    const signed = signPortalCookie("customer-123");
    expect(signed).toContain("customer-123");
    expect(signed).toContain(".");
    const verified = verifyPortalCookie(signed);
    expect(verified).toBe("customer-123");
  });

  it("produces different signatures for different customer IDs", () => {
    const sig1 = signPortalCookie("customer-1");
    const sig2 = signPortalCookie("customer-2");
    expect(sig1).not.toBe(sig2);
  });

  it("produces the same signature for the same customer ID", () => {
    const sig1 = signPortalCookie("customer-123");
    const sig2 = signPortalCookie("customer-123");
    expect(sig1).toBe(sig2);
  });

  it("returns null for tampered signature", () => {
    const signed = signPortalCookie("customer-123");
    // Tamper with the signature part
    const parts = signed.split(".");
    const tampered = `${parts[0]!}.${parts[1]!.slice(0, -2)}xx`;
    expect(verifyPortalCookie(tampered)).toBeNull();
  });

  it("returns null for tampered customer ID", () => {
    const signed = signPortalCookie("customer-123");
    // Replace the customer ID but keep the signature
    const dotIdx = signed.lastIndexOf(".");
    const sig = signed.slice(dotIdx + 1);
    const tampered = `customer-999.${sig}`;
    expect(verifyPortalCookie(tampered)).toBeNull();
  });

  it("returns null for value without dot separator", () => {
    expect(verifyPortalCookie("nodotinvalue")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(verifyPortalCookie("")).toBeNull();
  });

  it("returns null for value with only a dot", () => {
    expect(verifyPortalCookie(".")).toBeNull();
  });

  it("returns null for value ending with dot (empty signature)", () => {
    expect(verifyPortalCookie("customer-123.")).toBeNull();
  });

  it("returns null for value starting with dot (empty customer ID)", () => {
    expect(verifyPortalCookie(".abcdef")).toBeNull();
  });

  it("returns null for invalid hex signature", () => {
    expect(verifyPortalCookie("customer-123.notvalidhex")).toBeNull();
  });

  it("handles customer ID with dots (uses lastIndexOf)", () => {
    const signed = signPortalCookie("cust.123.456");
    expect(verifyPortalCookie(signed)).toBe("cust.123.456");
  });
});

describe("PORTAL_COOKIE constants", () => {
  it("has the correct cookie name", () => {
    expect(PORTAL_COOKIE_NAME).toBe("nirman-portal-customer");
  });

  it("has 7-day max age in seconds", () => {
    expect(PORTAL_COOKIE_MAX_AGE).toBe(7 * 24 * 60 * 60);
    expect(PORTAL_COOKIE_MAX_AGE).toBe(604800);
  });
});

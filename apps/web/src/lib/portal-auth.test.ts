/**
 * Unit tests for portal auth helpers.
 *
 *   signPortalCookie  — sign a customer ID + expiry with HMAC-SHA256
 *   verifyPortalCookie — verify a signed cookie value
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  signPortalCookie,
  verifyPortalCookie,
  PORTAL_COOKIE_NAME,
  PORTAL_COOKIE_MAX_AGE,
} from "./portal-auth";

afterEach(() => {
  vi.useRealTimers();
});

describe("signPortalCookie / verifyPortalCookie", () => {
  it("signs and verifies a customer ID round-trip", () => {
    const signed = signPortalCookie("customer-123");
    expect(signed).toContain("customer-123");
    expect(signed).toContain(".");
    const verified = verifyPortalCookie(signed);
    expect(verified).toBe("customer-123");
  });

  it("embeds an expiry timestamp inside the signed payload", () => {
    const signed = signPortalCookie("customer-123");
    // format: customerId.expiresAt.hexSignature
    const parts = signed.split(".");
    expect(parts.length).toBe(3);
    const expiresAt = parseInt(parts[1]!, 10);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + PORTAL_COOKIE_MAX_AGE * 1000 + 1000);
  });

  it("produces different signatures for different customer IDs", () => {
    const sig1 = signPortalCookie("customer-1");
    const sig2 = signPortalCookie("customer-2");
    expect(sig1).not.toBe(sig2);
  });

  it("rejects the cookie after its embedded expiry (server-side)", () => {
    const signed = signPortalCookie("customer-123");
    expect(verifyPortalCookie(signed)).toBe("customer-123");
    // Move the clock beyond the 7-day session window — a replayed cookie
    // must fail even though its signature is intact.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + PORTAL_COOKIE_MAX_AGE * 1000 + 60_000);
    expect(verifyPortalCookie(signed)).toBeNull();
  });

  it("returns null for tampered signature", () => {
    const signed = signPortalCookie("customer-123");
    // Tamper with the signature part (customerId.expiresAt.sig)
    const parts = signed.split(".");
    const tampered = `${parts[0]!}.${parts[1]!}.${parts[2]!.slice(0, -2)}xx`;
    expect(verifyPortalCookie(tampered)).toBeNull();
  });

  it("returns null for tampered expiry", () => {
    const signed = signPortalCookie("customer-123");
    const parts = signed.split(".");
    // Push expiry far into the future but keep the original signature
    const tampered = `${parts[0]!}.${Date.now() + 999_999_999}.${parts[2]!}`;
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

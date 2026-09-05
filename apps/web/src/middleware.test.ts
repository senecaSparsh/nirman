/**
 * Unit tests for middleware pure helpers.
 *
 *   isMobileUA             — test if a User-Agent string is a mobile device
 *   isPublicRoute          — check if a pathname is a public route
 *   isAuthRateLimitedPath  — check if a pathname is an auth rate-limited endpoint
 */
import { describe, it, expect } from "vitest";
import { isMobileUA, isPublicRoute, isAuthRateLimitedPath } from "./middleware";

describe("isMobileUA", () => {
  it("detects iPhone", () => {
    expect(isMobileUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)")).toBe(true);
  });

  it("detects Android phone (Mobile)", () => {
    expect(isMobileUA("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")).toBe(true);
  });

  it("detects iPod", () => {
    expect(isMobileUA("Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)")).toBe(true);
  });

  it("detects Windows Phone", () => {
    expect(isMobileUA("Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1)")).toBe(true);
  });

  it("detects BlackBerry", () => {
    expect(isMobileUA("Mozilla/5.0 (BlackBerry; U; BlackBerry 9900)")).toBe(true);
  });

  it("detects Opera Mini", () => {
    expect(isMobileUA("Opera/9.80 (J2ME/MIDP; Opera Mini/9.80)")).toBe(true);
  });

  it("detects Silk browser", () => {
    expect(isMobileUA("Mozilla/5.0 (Linux; Android 9; Silk)")).toBe(true);
  });

  it("does NOT detect desktop Chrome", () => {
    expect(isMobileUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")).toBe(false);
  });

  it("does NOT detect iPad in landscape (tablet)", () => {
    // iPad without "Mobile" in UA — tablets in landscape get desktop surface
    expect(isMobileUA("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe(false);
  });

  it("does NOT detect Android tablet without Mobile", () => {
    expect(isMobileUA("Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isMobileUA("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isMobileUA("Mozilla/5.0 (iphone; CPU iPhone OS 16_0)")).toBe(true);
  });
});

describe("isPublicRoute", () => {
  it("returns true for /sign-in", () => {
    expect(isPublicRoute("/sign-in")).toBe(true);
  });

  it("returns true for /sign-in/ subpaths", () => {
    expect(isPublicRoute("/sign-in/callback")).toBe(true);
  });

  it("returns true for /sign-up", () => {
    expect(isPublicRoute("/sign-up")).toBe(true);
  });

  it("returns true for /forgot-password", () => {
    expect(isPublicRoute("/forgot-password")).toBe(true);
  });

  it("returns true for /reset-password", () => {
    expect(isPublicRoute("/reset-password")).toBe(true);
  });

  it("returns true for /change-password", () => {
    expect(isPublicRoute("/change-password")).toBe(true);
  });

  it("returns true for /consent", () => {
    expect(isPublicRoute("/consent")).toBe(true);
  });

  it("returns true for /api/auth/* paths", () => {
    expect(isPublicRoute("/api/auth/sign-in/email")).toBe(true);
  });

  it("returns true for /api/telephony/webhook paths", () => {
    expect(isPublicRoute("/api/telephony/webhook/twilio/voice")).toBe(true);
  });

  it("returns true for /portal paths", () => {
    expect(isPublicRoute("/portal")).toBe(true);
    expect(isPublicRoute("/portal/listings")).toBe(true);
  });

  it("returns true for /api/portal/* paths", () => {
    expect(isPublicRoute("/api/portal/auth/otp/verify")).toBe(true);
  });

  it("returns true for /_next/* static assets", () => {
    expect(isPublicRoute("/_next/static/chunks/main.js")).toBe(true);
  });

  it("returns true for /favicon", () => {
    expect(isPublicRoute("/favicon.ico")).toBe(true);
  });

  it("returns true for static asset extensions", () => {
    expect(isPublicRoute("/images/logo.svg")).toBe(true);
    expect(isPublicRoute("/styles.css")).toBe(true);
    expect(isPublicRoute("/script.js")).toBe(true);
    expect(isPublicRoute("/photo.jpg")).toBe(true);
    expect(isPublicRoute("/icon.png")).toBe(true);
    expect(isPublicRoute("/manifest.webmanifest")).toBe(true);
    expect(isPublicRoute("/robots.txt")).toBe(true);
  });

  it("returns false for protected routes", () => {
    expect(isPublicRoute("/")).toBe(false);
    expect(isPublicRoute("/m")).toBe(false);
    expect(isPublicRoute("/procurement")).toBe(false);
    expect(isPublicRoute("/api/materials")).toBe(false);
  });

  it("returns false for non-auth API routes", () => {
    expect(isPublicRoute("/api/materials")).toBe(false);
    expect(isPublicRoute("/api/procurement")).toBe(false);
  });
});

describe("isAuthRateLimitedPath", () => {
  it("returns true for /api/auth/sign-in/email", () => {
    expect(isAuthRateLimitedPath("/api/auth/sign-in/email")).toBe(true);
  });

  it("returns true for /api/auth/sign-up/email", () => {
    expect(isAuthRateLimitedPath("/api/auth/sign-up/email")).toBe(true);
  });

  it("returns true for /api/auth/change-password", () => {
    expect(isAuthRateLimitedPath("/api/auth/change-password")).toBe(true);
  });

  it("returns true for /api/auth/reset-password", () => {
    expect(isAuthRateLimitedPath("/api/auth/reset-password")).toBe(true);
  });

  it("returns false for non-auth API routes", () => {
    expect(isAuthRateLimitedPath("/api/materials")).toBe(false);
  });

  it("returns false for /api/auth/get-session (no sign-in/sign-up/password)", () => {
    expect(isAuthRateLimitedPath("/api/auth/get-session")).toBe(false);
  });

  it("returns false for non-API paths", () => {
    expect(isAuthRateLimitedPath("/sign-in")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAuthRateLimitedPath("")).toBe(false);
  });
});

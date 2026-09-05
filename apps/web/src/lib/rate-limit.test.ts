/**
 * Unit tests for rate limit helpers.
 *
 *   refillTokenBucket  — refill tokens based on elapsed time
 *   computeRetryAfter  — compute retry-after seconds when rate limited
 */
import { describe, it, expect } from "vitest";
import { refillTokenBucket, computeRetryAfter, RATE_LIMITS } from "./rate-limit";

describe("refillTokenBucket", () => {
  it("refills tokens based on elapsed time", () => {
    // 0 tokens, 1 second elapsed, 30 tokens/sec refill → 30 tokens
    expect(refillTokenBucket(0, 1, 60, 30)).toBe(30);
  });

  it("caps at capacity", () => {
    // 50 tokens, 10 seconds elapsed, 30/sec refill → 50+300=350, capped at 60
    expect(refillTokenBucket(50, 10, 60, 30)).toBe(60);
  });

  it("handles zero elapsed time (no refill)", () => {
    expect(refillTokenBucket(30, 0, 60, 30)).toBe(30);
  });

  it("handles fractional elapsed time", () => {
    // 0 tokens, 0.5 seconds, 30/sec → 15 tokens
    expect(refillTokenBucket(0, 0.5, 60, 30)).toBe(15);
  });

  it("handles zero refill rate", () => {
    expect(refillTokenBucket(30, 10, 60, 0)).toBe(30);
  });

  it("handles already-full bucket", () => {
    expect(refillTokenBucket(60, 10, 60, 30)).toBe(60);
  });

  it("handles partial refill to exactly capacity", () => {
    // 30 tokens, 1 second, 30/sec → 60 (exactly capacity)
    expect(refillTokenBucket(30, 1, 60, 30)).toBe(60);
  });
});

describe("computeRetryAfter", () => {
  it("computes retry after for 0 tokens", () => {
    // (1 - 0) / 30 = 0.033... → ceil = 1
    expect(computeRetryAfter(0, 30)).toBe(1);
  });

  it("computes retry after for 0.5 tokens", () => {
    // (1 - 0.5) / 30 = 0.0166... → ceil = 1
    expect(computeRetryAfter(0.5, 30)).toBe(1);
  });

  it("computes retry after for 0.9 tokens", () => {
    // (1 - 0.9) / 30 = 0.0033... → ceil = 1
    expect(computeRetryAfter(0.9, 30)).toBe(1);
  });

  it("computes retry after for 0 tokens with slow refill", () => {
    // (1 - 0) / 0.1 = 10 → ceil = 10
    expect(computeRetryAfter(0, 0.1)).toBe(10);
  });

  it("computes retry after for 0 tokens with 1/sec refill", () => {
    // (1 - 0) / 1 = 1 → ceil = 1
    expect(computeRetryAfter(0, 1)).toBe(1);
  });

  it("returns 0 when tokens >= 1 (not rate limited)", () => {
    // (1 - 1) / 30 = 0 → ceil = 0
    expect(computeRetryAfter(1, 30)).toBe(0);
    // (1 - 2) / 30 = -0.033 → ceil = -0 (Math.ceil of negative fraction is -0 or negative)
    // This function is only called when tokens < 1, so this is an edge case
    expect(Math.abs(computeRetryAfter(2, 30))).toBe(0);
  });
});

describe("RATE_LIMITS", () => {
  it("has read, write, auth, webhook, heavy presets", () => {
    expect(RATE_LIMITS.read).toBeDefined();
    expect(RATE_LIMITS.write).toBeDefined();
    expect(RATE_LIMITS.auth).toBeDefined();
    expect(RATE_LIMITS.webhook).toBeDefined();
    expect(RATE_LIMITS.heavy).toBeDefined();
  });

  it("auth has capacity 5 (security limit, not scaled)", () => {
    expect(RATE_LIMITS.auth.capacity).toBe(5);
  });

  it("heavy has capacity 3 (security limit, not scaled)", () => {
    expect(RATE_LIMITS.heavy.capacity).toBe(3);
  });

  it("webhook has capacity 30 (external limit, not scaled)", () => {
    expect(RATE_LIMITS.webhook.capacity).toBe(30);
  });

  it("read capacity is a multiple of 60 (scaled by memory multiplier)", () => {
    expect(RATE_LIMITS.read.capacity % 60).toBe(0);
  });

  it("write capacity is a multiple of 20 (scaled by memory multiplier)", () => {
    expect(RATE_LIMITS.write.capacity % 20).toBe(0);
  });
});

/**
 * Unit tests for local-first cache helpers.
 *
 *   getCacheKey         — build localStorage cache key for a URL
 *   isCacheEntryStale   — check if a cache entry is stale
 */
import { describe, it, expect } from "vitest";
import { getCacheKey, isCacheEntryStale } from "./local-first";

describe("getCacheKey", () => {
  it("prefixes URL with nirman-cache:", () => {
    expect(getCacheKey("/api/materials")).toBe("nirman-cache:/api/materials");
  });

  it("handles empty URL", () => {
    expect(getCacheKey("")).toBe("nirman-cache:");
  });

  it("handles URL with query params", () => {
    expect(getCacheKey("/api/materials?take=10&cursor=abc")).toBe("nirman-cache:/api/materials?take=10&cursor=abc");
  });

  it("handles URL with path params", () => {
    expect(getCacheKey("/api/materials/mat-123")).toBe("nirman-cache:/api/materials/mat-123");
  });
});

describe("isCacheEntryStale", () => {
  const TTL = 5 * 60 * 1000; // 5 minutes
  const now = 1_000_000_000;

  it("returns false for fresh entry (within TTL)", () => {
    const entry = { data: "x", timestamp: now - 60_000, ttl: TTL };
    expect(isCacheEntryStale(entry, now)).toBe(false);
  });

  it("returns true for stale entry (past TTL)", () => {
    const entry = { data: "x", timestamp: now - TTL - 1, ttl: TTL };
    expect(isCacheEntryStale(entry, now)).toBe(true);
  });

  it("returns false for entry exactly at TTL boundary", () => {
    const entry = { data: "x", timestamp: now - TTL, ttl: TTL };
    expect(isCacheEntryStale(entry, now)).toBe(false);
  });

  it("returns true for entry just past TTL boundary", () => {
    const entry = { data: "x", timestamp: now - TTL - 1, ttl: TTL };
    expect(isCacheEntryStale(entry, now)).toBe(true);
  });

  it("returns false for entry with future timestamp", () => {
    const entry = { data: "x", timestamp: now + 60_000, ttl: TTL };
    expect(isCacheEntryStale(entry, now)).toBe(false);
  });

  it("handles zero TTL (always stale unless just now)", () => {
    const entry = { data: "x", timestamp: now, ttl: 0 };
    expect(isCacheEntryStale(entry, now)).toBe(false);
    const entry2 = { data: "x", timestamp: now - 1, ttl: 0 };
    expect(isCacheEntryStale(entry2, now)).toBe(true);
  });

  it("handles very large TTL (effectively never stale)", () => {
    const entry = { data: "x", timestamp: 0, ttl: Number.MAX_SAFE_INTEGER };
    expect(isCacheEntryStale(entry, now)).toBe(false);
  });
});

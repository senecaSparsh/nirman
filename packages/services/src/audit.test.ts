/**
 * Unit tests for the pure audit helper.
 *
 *   resolveUserIdFromCache — resolve userId for audit logging from cache
 */
import { describe, it, expect } from "vitest";
import { resolveUserIdFromCache } from "./audit";

describe("resolveUserIdFromCache", () => {
  it("returns null for undefined userId", () => {
    expect(resolveUserIdFromCache(undefined, new Map())).toBeNull();
  });

  it("returns null for empty string userId", () => {
    expect(resolveUserIdFromCache("", new Map())).toBeNull();
  });

  it("returns null for 'dev' synthetic user", () => {
    expect(resolveUserIdFromCache("dev", new Map())).toBeNull();
  });

  it("returns userId when cached as existing", () => {
    const cache = new Map([["user-1", true]]);
    expect(resolveUserIdFromCache("user-1", cache)).toBe("user-1");
  });

  it("returns null when cached as not existing", () => {
    const cache = new Map([["user-2", false]]);
    expect(resolveUserIdFromCache("user-2", cache)).toBeNull();
  });

  it("returns undefined when not in cache", () => {
    const cache = new Map<string, boolean>();
    expect(resolveUserIdFromCache("user-3", cache)).toBeUndefined();
  });

  it("returns undefined for empty cache", () => {
    expect(resolveUserIdFromCache("user-4", new Map())).toBeUndefined();
  });

  it("handles 'dev' even when in cache as true", () => {
    // 'dev' is always null regardless of cache
    const cache = new Map([["dev", true]]);
    expect(resolveUserIdFromCache("dev", cache)).toBeNull();
  });
});

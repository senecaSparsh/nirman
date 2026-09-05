/**
 * Unit tests for the pure helpers in optimistic-locking.ts.
 *
 * `extractVersion()` extracts a version number from a request body,
 * returning undefined for missing/invalid values (backward compatible).
 * `ConcurrentEditError` is a custom error class for 409 conflicts.
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import { extractVersion, ConcurrentEditError } from "./optimistic-locking";

describe("extractVersion", () => {
  it("returns the version when it's a valid non-negative number", () => {
    expect(extractVersion({ version: 0 })).toBe(0);
    expect(extractVersion({ version: 1 })).toBe(1);
    expect(extractVersion({ version: 42 })).toBe(42);
  });

  it("returns undefined when version is missing", () => {
    expect(extractVersion({})).toBeUndefined();
    expect(extractVersion({ other: "field" } as { version?: number })).toBeUndefined();
  });

  it("returns undefined when version is not a number", () => {
    expect(extractVersion({ version: "1" as unknown as number })).toBeUndefined();
    expect(extractVersion({ version: true as unknown as number })).toBeUndefined();
    expect(extractVersion({ version: null as unknown as number })).toBeUndefined();
  });

  it("returns undefined when version is negative", () => {
    expect(extractVersion({ version: -1 })).toBeUndefined();
    expect(extractVersion({ version: -100 })).toBeUndefined();
  });
});

describe("ConcurrentEditError", () => {
  it("creates an error with 409 status code", () => {
    const err = new ConcurrentEditError("Material", "mat-123", 3, 5);
    expect(err.status).toBe(409);
    expect(err.message).toContain("Material");
    expect(err.message).toContain("mat-123");
    expect(err.message).toContain("3");
    expect(err.message).toContain("5");
  });

  it("has the correct name", () => {
    const err = new ConcurrentEditError("Project", "proj-1", 1, 2);
    expect(err.name).toBe("ConcurrentEditError");
  });

  it("is an instance of Error", () => {
    const err = new ConcurrentEditError("Material", "m1", 0, 1);
    expect(err).toBeInstanceOf(Error);
  });
});

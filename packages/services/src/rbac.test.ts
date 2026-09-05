/**
 * Unit tests for the pure RBAC helpers in rbac.ts.
 *
 *   defaultScopeType       — default scope for a role when membership doesn't set one
 *   resolveScopeType       — effective scope (explicit > role default; OWNER/ADMIN always COMPANY)
 *   requiresScopeEntries   — does a scope type need explicit entries?
 *   validateScopeEntries   — validate entries match declared scope type
 *   wouldCreateCycle       — prevent reporting cycles
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  defaultScopeType,
  resolveScopeType,
  requiresScopeEntries,
  validateScopeEntries,
  wouldCreateCycle,
  RbacError,
} from "./rbac";

describe("defaultScopeType", () => {
  it("returns COMPANY for OWNER and ADMIN", () => {
    expect(defaultScopeType("OWNER")).toBe("COMPANY");
    expect(defaultScopeType("ADMIN")).toBe("COMPANY");
  });

  it("returns COMPANY for senior management (PROJECT_DIRECTOR, FINANCE_HEAD)", () => {
    expect(defaultScopeType("PROJECT_DIRECTOR")).toBe("COMPANY");
    expect(defaultScopeType("FINANCE_HEAD")).toBe("COMPANY");
  });

  it("returns COMPANY for middle management (PROJECT_MANAGER, PROCUREMENT_MANAGER, HR_MANAGER)", () => {
    expect(defaultScopeType("PROJECT_MANAGER")).toBe("COMPANY");
    expect(defaultScopeType("PROCUREMENT_MANAGER")).toBe("COMPANY");
    expect(defaultScopeType("HR_MANAGER")).toBe("COMPANY");
  });

  it("returns PROJECT for field/execution roles", () => {
    expect(defaultScopeType("SITE_ENGINEER")).toBe("PROJECT");
    expect(defaultScopeType("STORE_KEEPER")).toBe("PROJECT");
    expect(defaultScopeType("SUPERVISOR")).toBe("PROJECT");
    expect(defaultScopeType("QAQC_ENGINEER")).toBe("PROJECT");
  });

  it("returns COMPANY for ACCOUNTANT and SALES_MANAGER", () => {
    expect(defaultScopeType("ACCOUNTANT")).toBe("COMPANY");
    expect(defaultScopeType("SALES_MANAGER")).toBe("COMPANY");
  });

  it("returns COMPANY for unknown roles (safe default)", () => {
    expect(defaultScopeType("UNKNOWN_ROLE")).toBe("COMPANY");
  });
});

describe("resolveScopeType", () => {
  it("always returns COMPANY for OWNER regardless of explicit scopeType", () => {
    expect(resolveScopeType({ role: "OWNER", scopeType: "PROJECT" })).toBe("COMPANY");
    expect(resolveScopeType({ role: "OWNER", scopeType: "DEPARTMENT" })).toBe("COMPANY");
    expect(resolveScopeType({ role: "OWNER", scopeType: null })).toBe("COMPANY");
  });

  it("always returns COMPANY for ADMIN regardless of explicit scopeType", () => {
    expect(resolveScopeType({ role: "ADMIN", scopeType: "PROJECT" })).toBe("COMPANY");
  });

  it("uses explicit scopeType when set for non-OWNER/ADMIN roles", () => {
    expect(resolveScopeType({ role: "PROJECT_MANAGER", scopeType: "DEPARTMENT" })).toBe("DEPARTMENT");
    expect(resolveScopeType({ role: "SITE_ENGINEER", scopeType: "PROJECT" })).toBe("PROJECT");
  });

  it("falls back to role default when scopeType is null", () => {
    expect(resolveScopeType({ role: "SITE_ENGINEER", scopeType: null })).toBe("PROJECT");
    expect(resolveScopeType({ role: "PROJECT_MANAGER", scopeType: null })).toBe("COMPANY");
  });

  it("falls back to role default when scopeType is an invalid string", () => {
    expect(resolveScopeType({ role: "SITE_ENGINEER", scopeType: "INVALID" })).toBe("PROJECT");
    expect(resolveScopeType({ role: "PROJECT_MANAGER", scopeType: "INVALID" })).toBe("COMPANY");
  });
});

describe("requiresScopeEntries", () => {
  it("returns false for COMPANY scope (unscoped)", () => {
    expect(requiresScopeEntries("COMPANY")).toBe(false);
  });

  it("returns true for DEPARTMENT scope", () => {
    expect(requiresScopeEntries("DEPARTMENT")).toBe(true);
  });

  it("returns true for PROJECT scope", () => {
    expect(requiresScopeEntries("PROJECT")).toBe(true);
  });
});

describe("validateScopeEntries", () => {
  it("throws if COMPANY scope has entries", () => {
    expect(() =>
      validateScopeEntries("COMPANY", [{ departmentId: "d1" }]),
    ).toThrow(RbacError);
    expect(() =>
      validateScopeEntries("COMPANY", [{ projectId: "p1" }]),
    ).toThrow(RbacError);
  });

  it("passes for COMPANY scope with no entries", () => {
    expect(() => validateScopeEntries("COMPANY", [])).not.toThrow();
  });

  it("throws if DEPARTMENT scope has no entries", () => {
    expect(() => validateScopeEntries("DEPARTMENT", [])).toThrow(RbacError);
  });

  it("passes for DEPARTMENT scope with valid entries", () => {
    expect(() =>
      validateScopeEntries("DEPARTMENT", [
        { departmentId: "d1", projectId: null },
        { departmentId: "d2", projectId: null },
      ]),
    ).not.toThrow();
  });

  it("throws if DEPARTMENT entry is missing departmentId", () => {
    expect(() =>
      validateScopeEntries("DEPARTMENT", [{ departmentId: null, projectId: null }]),
    ).toThrow(RbacError);
  });

  it("throws if DEPARTMENT entry has projectId (wrong scope kind)", () => {
    expect(() =>
      validateScopeEntries("DEPARTMENT", [{ departmentId: "d1", projectId: "p1" }]),
    ).toThrow(RbacError);
  });

  it("throws if PROJECT scope has no entries", () => {
    expect(() => validateScopeEntries("PROJECT", [])).toThrow(RbacError);
  });

  it("passes for PROJECT scope with valid entries", () => {
    expect(() =>
      validateScopeEntries("PROJECT", [
        { projectId: "p1", departmentId: null },
        { projectId: "p2", departmentId: null },
      ]),
    ).not.toThrow();
  });

  it("throws if PROJECT entry is missing projectId", () => {
    expect(() =>
      validateScopeEntries("PROJECT", [{ projectId: null, departmentId: null }]),
    ).toThrow(RbacError);
  });

  it("throws if PROJECT entry has departmentId (wrong scope kind)", () => {
    expect(() =>
      validateScopeEntries("PROJECT", [{ projectId: "p1", departmentId: "d1" }]),
    ).toThrow(RbacError);
  });
});

describe("wouldCreateCycle", () => {
  it("returns true if candidate is the same as the first chain element", () => {
    expect(wouldCreateCycle("user-A", ["user-A", "user-B", "user-C"])).toBe(true);
  });

  it("returns true if candidate is anywhere in the reporting chain", () => {
    expect(wouldCreateCycle("user-B", ["user-A", "user-B", "user-C"])).toBe(true);
    expect(wouldCreateCycle("user-C", ["user-A", "user-B", "user-C"])).toBe(true);
  });

  it("returns false if candidate is not in the chain", () => {
    expect(wouldCreateCycle("user-D", ["user-A", "user-B", "user-C"])).toBe(false);
  });

  it("returns false for empty chain", () => {
    expect(wouldCreateCycle("user-A", [])).toBe(false);
  });

  it("handles single-element chain (self-reporting)", () => {
    expect(wouldCreateCycle("user-A", ["user-A"])).toBe(true);
    expect(wouldCreateCycle("user-B", ["user-A"])).toBe(false);
  });
});

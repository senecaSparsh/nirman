import { describe, it, expect } from "vitest";
import {
  defaultScopeType,
  resolveScopeType,
  requiresScopeEntries,
  validateScopeEntries,
  wouldCreateCycle,
  _svcCanAssignRole,
  RbacError,
} from "./rbac";

describe("rbac — pure helpers", () => {
  describe("defaultScopeType", () => {
    it("OWNER/ADMIN → COMPANY (full system control tier)", () => {
      expect(defaultScopeType("OWNER")).toBe("COMPANY");
      expect(defaultScopeType("ADMIN")).toBe("COMPANY");
    });
    it("MANAGER → COMPANY (regional heads opt into DEPARTMENT explicitly)", () => {
      expect(defaultScopeType("MANAGER")).toBe("COMPANY");
    });
    it("SUPERVISOR → PROJECT (site managers / field supervisors)", () => {
      expect(defaultScopeType("SUPERVISOR")).toBe("PROJECT");
    });
    it("SALES/ACCOUNTANT → COMPANY (default to company-wide)", () => {
      expect(defaultScopeType("SALES")).toBe("COMPANY");
      expect(defaultScopeType("ACCOUNTANT")).toBe("COMPANY");
    });
    it("unknown role → COMPANY (safe default)", () => {
      expect(defaultScopeType("WHATEVER")).toBe("COMPANY");
    });
  });

  describe("resolveScopeType", () => {
    it("OWNER/ADMIN are always COMPANY even if scopeType is set", () => {
      expect(resolveScopeType({ scopeType: "DEPARTMENT", role: "ADMIN" })).toBe("COMPANY");
      expect(resolveScopeType({ scopeType: "PROJECT", role: "OWNER" })).toBe("COMPANY");
      expect(resolveScopeType({ scopeType: null, role: "OWNER" })).toBe("COMPANY");
    });
    it("explicit scopeType wins over the role default", () => {
      expect(resolveScopeType({ scopeType: "DEPARTMENT", role: "MANAGER" })).toBe("DEPARTMENT");
      expect(resolveScopeType({ scopeType: "PROJECT", role: "MANAGER" })).toBe("PROJECT");
    });
    it("null scopeType falls back to the role default", () => {
      expect(resolveScopeType({ scopeType: null, role: "SUPERVISOR" })).toBe("PROJECT");
      expect(resolveScopeType({ scopeType: null, role: "MANAGER" })).toBe("COMPANY");
    });
    it("invalid scopeType string falls back to the role default", () => {
      expect(resolveScopeType({ scopeType: "BOGUS", role: "SUPERVISOR" })).toBe("PROJECT");
    });
  });

  describe("requiresScopeEntries", () => {
    it("COMPANY = no entries needed", () => {
      expect(requiresScopeEntries("COMPANY")).toBe(false);
    });
    it("DEPARTMENT/PROJECT = entries required", () => {
      expect(requiresScopeEntries("DEPARTMENT")).toBe(true);
      expect(requiresScopeEntries("PROJECT")).toBe(true);
    });
  });

  describe("validateScopeEntries", () => {
    it("COMPANY scope rejects any entries", () => {
      expect(() => validateScopeEntries("COMPANY", [{ departmentId: "d1" }])).toThrow(RbacError);
      expect(() => validateScopeEntries("COMPANY", [])).not.toThrow();
    });
    it("DEPARTMENT scope requires ≥1 entry with departmentId, no projectId", () => {
      expect(() => validateScopeEntries("DEPARTMENT", [])).toThrow(RbacError);
      expect(() => validateScopeEntries("DEPARTMENT", [{ projectId: "p1" }])).toThrow(RbacError);
      expect(() =>
        validateScopeEntries("DEPARTMENT", [{ departmentId: "d1" }, { departmentId: "d2" }]),
      ).not.toThrow();
      expect(() =>
        validateScopeEntries("DEPARTMENT", [{ departmentId: "d1", projectId: "p1" }]),
      ).toThrow(RbacError);
    });
    it("PROJECT scope requires ≥1 entry with projectId, no departmentId", () => {
      expect(() => validateScopeEntries("PROJECT", [])).toThrow(RbacError);
      expect(() => validateScopeEntries("PROJECT", [{ departmentId: "d1" }])).toThrow(RbacError);
      expect(() => validateScopeEntries("PROJECT", [{ projectId: "p1" }])).not.toThrow();
      expect(() =>
        validateScopeEntries("PROJECT", [{ projectId: "p1", departmentId: "d1" }]),
      ).toThrow(RbacError);
    });
  });

  describe("wouldCreateCycle", () => {
    it("self-reference is a cycle", () => {
      expect(wouldCreateCycle("a", ["a"])).toBe(true);
    });
    it("reporting to an ancestor in the chain is a cycle", () => {
      expect(wouldCreateCycle("c", ["a", "b", "c"])).toBe(true);
    });
    it("reporting to someone outside the chain is fine", () => {
      expect(wouldCreateCycle("z", ["a", "b", "c"])).toBe(false);
    });
    it("empty chain never cycles", () => {
      expect(wouldCreateCycle("a", [])).toBe(false);
    });
  });

  describe("_svcCanAssignRole — delegation hierarchy", () => {
    it("OWNER (tier 1) can assign all roles below + ADMIN peer", () => {
      expect(_svcCanAssignRole("OWNER", "ADMIN")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "MANAGER")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "SALES")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "ACCOUNTANT")).toBe(true);
    });
    it("OWNER cannot assign OWNER (same tier — no self-peer)", () => {
      expect(_svcCanAssignRole("OWNER", "OWNER")).toBe(false);
    });
    it("ADMIN can assign OWNER + all below, but not ADMIN (self-peer)", () => {
      expect(_svcCanAssignRole("ADMIN", "OWNER")).toBe(true);
      expect(_svcCanAssignRole("ADMIN", "MANAGER")).toBe(true);
      expect(_svcCanAssignRole("ADMIN", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("ADMIN", "ADMIN")).toBe(false);
    });
    it("MANAGER (Sub-Admin, tier 2) can only assign tier 3", () => {
      expect(_svcCanAssignRole("MANAGER", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("MANAGER", "SALES")).toBe(true);
      expect(_svcCanAssignRole("MANAGER", "ACCOUNTANT")).toBe(true);
      expect(_svcCanAssignRole("MANAGER", "MANAGER")).toBe(false);
      expect(_svcCanAssignRole("MANAGER", "ADMIN")).toBe(false);
      expect(_svcCanAssignRole("MANAGER", "OWNER")).toBe(false);
    });
    it("tier 3 roles cannot assign anyone", () => {
      expect(_svcCanAssignRole("SUPERVISOR", "SUPERVISOR")).toBe(false);
      expect(_svcCanAssignRole("SUPERVISOR", "MANAGER")).toBe(false);
      expect(_svcCanAssignRole("SALES", "SUPERVISOR")).toBe(false);
      expect(_svcCanAssignRole("ACCOUNTANT", "SUPERVISOR")).toBe(false);
    });
    it("invalid roles default to tier 3 (can't assign)", () => {
      expect(_svcCanAssignRole("BOGUS", "SUPERVISOR")).toBe(false);
    });
  });
});

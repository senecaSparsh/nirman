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
    it("PROJECT_DIRECTOR/FINANCE_HEAD → COMPANY (senior management)", () => {
      expect(defaultScopeType("PROJECT_DIRECTOR")).toBe("COMPANY");
      expect(defaultScopeType("FINANCE_HEAD")).toBe("COMPANY");
    });
    it("PROJECT_MANAGER/PROCUREMENT_MANAGER/HR_MANAGER → COMPANY (middle management)", () => {
      expect(defaultScopeType("PROJECT_MANAGER")).toBe("COMPANY");
      expect(defaultScopeType("PROCUREMENT_MANAGER")).toBe("COMPANY");
      expect(defaultScopeType("HR_MANAGER")).toBe("COMPANY");
    });
    it("SITE_ENGINEER/STORE_KEEPER/SUPERVISOR/QAQC_ENGINEER → PROJECT (field/execution)", () => {
      expect(defaultScopeType("SITE_ENGINEER")).toBe("PROJECT");
      expect(defaultScopeType("STORE_KEEPER")).toBe("PROJECT");
      expect(defaultScopeType("SUPERVISOR")).toBe("PROJECT");
      expect(defaultScopeType("QAQC_ENGINEER")).toBe("PROJECT");
    });
    it("SALES_MANAGER/ACCOUNTANT → COMPANY (default to company-wide)", () => {
      expect(defaultScopeType("SALES_MANAGER")).toBe("COMPANY");
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
      expect(resolveScopeType({ scopeType: "DEPARTMENT", role: "PROJECT_MANAGER" })).toBe("DEPARTMENT");
      expect(resolveScopeType({ scopeType: "PROJECT", role: "PROJECT_MANAGER" })).toBe("PROJECT");
    });
    it("null scopeType falls back to the role default", () => {
      expect(resolveScopeType({ scopeType: null, role: "SUPERVISOR" })).toBe("PROJECT");
      expect(resolveScopeType({ scopeType: null, role: "PROJECT_MANAGER" })).toBe("COMPANY");
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

  describe("_svcCanAssignRole — 5-tier delegation hierarchy", () => {
    it("OWNER (tier 1) can assign all roles below + ADMIN peer", () => {
      expect(_svcCanAssignRole("OWNER", "ADMIN")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "PROJECT_DIRECTOR")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "PROJECT_MANAGER")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "SITE_ENGINEER")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("OWNER", "QAQC_ENGINEER")).toBe(true);
    });
    it("OWNER cannot assign OWNER (same role — no self-cloning)", () => {
      expect(_svcCanAssignRole("OWNER", "OWNER")).toBe(false);
    });
    it("ADMIN can assign OWNER + all below, but not ADMIN (self-cloning)", () => {
      expect(_svcCanAssignRole("ADMIN", "OWNER")).toBe(true);
      expect(_svcCanAssignRole("ADMIN", "PROJECT_MANAGER")).toBe(true);
      expect(_svcCanAssignRole("ADMIN", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("ADMIN", "ADMIN")).toBe(false);
    });
    it("PROJECT_DIRECTOR (tier 2) can assign tier 3-5, not tier 1 or peers", () => {
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "PROJECT_MANAGER")).toBe(true);
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "SITE_ENGINEER")).toBe(true);
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "PROJECT_DIRECTOR")).toBe(false);
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "FINANCE_HEAD")).toBe(false); // peer
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "ADMIN")).toBe(false);
      expect(_svcCanAssignRole("PROJECT_DIRECTOR", "OWNER")).toBe(false);
    });
    it("PROJECT_MANAGER (tier 3) can assign tier 4-5, not tier 1-2 or peers", () => {
      expect(_svcCanAssignRole("PROJECT_MANAGER", "SITE_ENGINEER")).toBe(true);
      expect(_svcCanAssignRole("PROJECT_MANAGER", "STORE_KEEPER")).toBe(true);
      expect(_svcCanAssignRole("PROJECT_MANAGER", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("PROJECT_MANAGER", "PROJECT_MANAGER")).toBe(false);
      expect(_svcCanAssignRole("PROJECT_MANAGER", "PROCUREMENT_MANAGER")).toBe(false); // peer
      expect(_svcCanAssignRole("PROJECT_MANAGER", "PROJECT_DIRECTOR")).toBe(false);
      expect(_svcCanAssignRole("PROJECT_MANAGER", "OWNER")).toBe(false);
    });
    it("SITE_ENGINEER (tier 4) can assign tier 5 only", () => {
      expect(_svcCanAssignRole("SITE_ENGINEER", "SUPERVISOR")).toBe(true);
      expect(_svcCanAssignRole("SITE_ENGINEER", "QAQC_ENGINEER")).toBe(true);
      expect(_svcCanAssignRole("SITE_ENGINEER", "SITE_ENGINEER")).toBe(false);
      expect(_svcCanAssignRole("SITE_ENGINEER", "STORE_KEEPER")).toBe(false); // peer
      expect(_svcCanAssignRole("SITE_ENGINEER", "PROJECT_MANAGER")).toBe(false);
    });
    it("tier 5 roles cannot assign anyone", () => {
      expect(_svcCanAssignRole("SUPERVISOR", "SUPERVISOR")).toBe(false);
      expect(_svcCanAssignRole("SUPERVISOR", "QAQC_ENGINEER")).toBe(false);
      expect(_svcCanAssignRole("QAQC_ENGINEER", "SUPERVISOR")).toBe(false);
    });
    it("invalid roles default to tier 5 (can't assign)", () => {
      expect(_svcCanAssignRole("BOGUS", "SUPERVISOR")).toBe(false);
    });
  });
});

/**
 * Scope grants on company memberships: company-wide access is limited to the
 * roles that hold it, entries must belong to the company, and no actor can
 * grant more than their own scope — including through a parent company they
 * manage a group member from.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  userCompany: { findUnique: vi.fn() },
  customRole: { findFirst: vi.fn() },
  project: { count: vi.fn() },
  department: { count: vi.fn() },
}));

vi.mock("@nirman/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nirman/db")>()),
  prisma: db,
}));

import { assertMemberScopeGrant, assertScopeAllowedForRoles, assignScopedMembership, resolveUserScope } from "./rbac";

type Membership = {
  role: string;
  secondaryRoles: string[];
  activeRole: string | null;
  scopeType: string | null;
  scopes: { projectId: string | null; departmentId: string | null }[];
  active?: boolean;
};

const memberships = new Map<string, Membership>();
const parents = new Map<string, string | null>();
const OWNER: Membership = { role: "OWNER", secondaryRoles: [], activeRole: null, scopeType: null, scopes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  memberships.clear();
  parents.clear();
  memberships.set("owner-1@company-1", OWNER);
  db.userCompany.findUnique.mockImplementation(async ({ where }: any) =>
    memberships.get(`${where.userId_companyId.userId}@${where.userId_companyId.companyId}`) ?? null,
  );
  db.company.findUnique.mockImplementation(async ({ where }: any) =>
    parents.has(where.id) ? { parentCompanyId: parents.get(where.id) } : null,
  );
  db.customRole.findFirst.mockResolvedValue(null);
  db.project.count.mockResolvedValue(1);
  db.department.count.mockResolvedValue(1);
  db.user.findUnique.mockResolvedValue({ id: "u-new" });
});

describe("assertMemberScopeGrant", () => {
  const base = { actorUserId: "owner-1", companyId: "company-1" };

  it("refuses company-wide scope for a project manager", async () => {
    await expect(
      assertMemberScopeGrant({ ...base, role: "PROJECT_MANAGER", scopeType: "COMPANY", entries: [] }),
    ).rejects.toThrow(/Company-wide access is limited/);
  });

  it("allows company-wide scope for a finance head chosen explicitly", async () => {
    await expect(
      assertMemberScopeGrant({ ...base, role: "FINANCE_HEAD", scopeType: "COMPANY", entries: [] }),
    ).resolves.toEqual([]);
  });

  it("refuses company-wide scope for a scratch custom role with no base role", async () => {
    db.customRole.findFirst.mockResolvedValue({ baseRole: null, tier: 3 });
    await expect(
      assertMemberScopeGrant({ ...base, role: "CUSTOM_QC_LEAD", scopeType: "COMPANY", entries: [] }),
    ).rejects.toThrow(/Company-wide access is limited/);
  });

  it("allows company-wide scope for a custom role based on finance head", async () => {
    db.customRole.findFirst.mockResolvedValue({ baseRole: "FINANCE_HEAD", tier: 2 });
    await expect(
      assertMemberScopeGrant({ ...base, role: "CUSTOM_CFO_OFFICE", scopeType: "COMPANY", entries: [] }),
    ).resolves.toEqual([]);
  });

  it("refuses a project scope with no project", async () => {
    await expect(
      assertMemberScopeGrant({ ...base, role: "SUPERVISOR", scopeType: "PROJECT", entries: [] }),
    ).rejects.toThrow(/at least one scope entry/);
  });

  it("refuses a project that belongs to another company", async () => {
    db.project.count.mockResolvedValue(0);
    await expect(
      assertMemberScopeGrant({ ...base, role: "SUPERVISOR", scopeType: "PROJECT", entries: [{ projectId: "p-other" }] }),
    ).rejects.toThrow(/not found in this company/);
  });

  it("returns each project once as a scope row", async () => {
    await expect(
      assertMemberScopeGrant({
        ...base,
        role: "SUPERVISOR",
        scopeType: "PROJECT",
        entries: [{ projectId: "p-1" }, { projectId: "p-1" }],
      }),
    ).resolves.toEqual([{ scopeKind: "PROJECT", projectId: "p-1" }]);
  });

  it("refuses company-wide scope from an actor whose own access is narrower in the parent company", async () => {
    memberships.set("lead-1@parent", {
      role: "PROJECT_MANAGER",
      secondaryRoles: [],
      activeRole: null,
      scopeType: "PROJECT",
      scopes: [{ projectId: "p-parent", departmentId: null }],
    });
    parents.set("child", "parent");
    parents.set("parent", null);
    await expect(
      assertMemberScopeGrant({ actorUserId: "lead-1", companyId: "child", role: "FINANCE_HEAD", scopeType: "COMPANY", entries: [] }),
    ).rejects.toThrow(/can't grant company-wide scope/);
  });

  it("lets an owner of the parent company grant company-wide scope in a group company", async () => {
    memberships.set("owner-1@parent", OWNER);
    parents.set("child", "parent");
    parents.set("parent", null);
    await expect(
      assertMemberScopeGrant({ actorUserId: "owner-1", companyId: "child", role: "ACCOUNTANT", scopeType: "COMPANY", entries: [] }),
    ).resolves.toEqual([]);
  });

  it("refuses an actor with no membership in the company or its parent", async () => {
    parents.set("child", null);
    await expect(
      assertMemberScopeGrant({ actorUserId: "stranger", companyId: "child", role: "SUPERVISOR", scopeType: "PROJECT", entries: [{ projectId: "p-1" }] }),
    ).rejects.toThrow(/not a member/);
  });
});

describe("assertScopeAllowedForRoles", () => {
  it("refuses company-wide when any held hat is not company-eligible", async () => {
    await expect(assertScopeAllowedForRoles("company-1", ["FINANCE_HEAD", "SUPERVISOR"], "COMPANY")).rejects.toThrow(
      /Company-wide access is limited/,
    );
  });

  it("allows company-wide when every held hat is company-eligible", async () => {
    await expect(assertScopeAllowedForRoles("company-1", ["FINANCE_HEAD", "ACCOUNTANT"], "COMPANY")).resolves.toBeUndefined();
  });
});

describe("assignScopedMembership", () => {
  it("refuses an explicit company-wide scope for a supervisor", async () => {
    await expect(
      assignScopedMembership({
        actorUserId: "owner-1",
        userId: "u-new",
        companyId: "company-1",
        role: "SUPERVISOR",
        scopeType: "COMPANY",
        scopeEntries: [],
      }),
    ).rejects.toThrow(/Company-wide access is limited/);
  });
});

describe("deactivated memberships", () => {
  it("resolveUserScope resolves no scope for a deactivated membership", async () => {
    memberships.set("gone@company-1", {
      role: "OWNER",
      secondaryRoles: [],
      activeRole: null,
      scopeType: "COMPANY",
      scopes: [],
      active: false,
    });
    await expect(resolveUserScope("gone", "company-1")).resolves.toBeNull();
  });

  it("assignScopedMembership refuses an actor whose membership is deactivated", async () => {
    memberships.set("owner-1@company-1", { ...OWNER, active: false });
    await expect(
      assignScopedMembership({
        actorUserId: "owner-1",
        userId: "u-new",
        companyId: "company-1",
        role: "SUPERVISOR",
        scopeType: "PROJECT",
        scopeEntries: [{ projectId: "p-1" }],
      }),
    ).rejects.toThrow(/not a member/);
  });

  it("assignScopedMembership refuses to edit a deactivated membership", async () => {
    memberships.set("u-old@company-1", {
      role: "SUPERVISOR",
      secondaryRoles: [],
      activeRole: null,
      scopeType: "PROJECT",
      scopes: [],
      active: false,
    });
    await expect(
      assignScopedMembership({
        actorUserId: "owner-1",
        userId: "u-old",
        companyId: "company-1",
        role: "SITE_ENGINEER",
        scopeType: "PROJECT",
        scopeEntries: [{ projectId: "p-1" }],
      }),
    ).rejects.toThrow(/deactivated/);
  });
});

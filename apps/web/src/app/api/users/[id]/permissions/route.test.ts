import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, logAction: vi.fn().mockResolvedValue(undefined) };
});

import { PATCH } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };
const HR = { role: "HR_MANAGER" as const, id: "user-hr-1" };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchReq(uid: string, body: unknown) {
  return makeRequest(`/api/users/${uid}/permissions`, { method: "PATCH", body });
}

describe("PATCH /api/users/[id]/permissions", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // userCompany.findUnique serves both the actor's own membership lookup
    // (getActingRole/getUserPermissions) and the target's — distinguish by userId.
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      if (uid === "user-owner-1") return { id: "uc-owner", userId: uid, role: "OWNER", userPermissions: [] };
      if (uid === "user-hr-1") return { id: "uc-hr", userId: uid, role: "HR_MANAGER", userPermissions: [] };
      return { id: "uc-target", userId: uid, role: "SITE_ENGINEER", userPermissions: [] };
    });
    mockPrisma().userPermission!.findMany.mockResolvedValue([]);
    mockPrisma().userPermission!.createMany.mockClear();
    mockPrisma().userPermission!.deleteMany.mockClear();
  });

  it("grants overrides on a lower-tier member", async () => {
    const res = await PATCH(patchReq("u-rohan", { permissions: ["finance.view"] }), makeCtx("u-rohan"));
    expect(res.status).toBe(200);
    expect(mockPrisma().userPermission!.createMany).toHaveBeenCalled();
  });

  it("rejects a permission key not in the vocabulary", async () => {
    const res = await PATCH(patchReq("u-rohan", { permissions: ["nonsense.perm"] }), makeCtx("u-rohan"));
    expect(res.status).toBe(400);
  });

  it("blocks editing your own overrides (self-escalation)", async () => {
    // Regression: anyone with users.manage could previously PATCH their own
    // membership and grant themselves finance.manage, company.manage, …
    setSessionUser(HR);
    const res = await PATCH(patchReq("user-hr-1", { permissions: ["finance.manage", "company.manage"] }), makeCtx("user-hr-1"));
    expect(res.status).toBe(400);
    expect(mockPrisma().userPermission!.createMany).not.toHaveBeenCalled();
  });

  it("blocks an HR manager from editing a tier-1 member's overrides", async () => {
    setSessionUser(HR);
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      if (uid === "user-hr-1") return { id: "uc-hr", userId: uid, role: "HR_MANAGER", userPermissions: [] };
      return { id: "uc-owner", userId: uid, role: "OWNER", userPermissions: [] };
    });
    const res = await PATCH(patchReq("user-owner-1", { permissions: ["finance.manage"] }), makeCtx("user-owner-1"));
    expect(res.status).toBe(403);
    expect(mockPrisma().userPermission!.createMany).not.toHaveBeenCalled();
  });

  it("blocks an HR manager from editing a tier-2 member's overrides", async () => {
    setSessionUser(HR);
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      if (uid === "user-hr-1") return { id: "uc-hr", userId: uid, role: "HR_MANAGER", userPermissions: [] };
      return { id: "uc-dir", userId: uid, role: "PROJECT_DIRECTOR", userPermissions: [] };
    });
    const res = await PATCH(patchReq("u-dir", { permissions: ["finance.manage"] }), makeCtx("u-dir"));
    expect(res.status).toBe(403);
  });

  it("lets an HR manager edit a lower-tier member's overrides", async () => {
    setSessionUser(HR);
    const res = await PATCH(patchReq("u-rohan", { permissions: ["gate_pass.view"] }), makeCtx("u-rohan"));
    expect(res.status).toBe(200);
  });

  it("returns 404 when the target is not a member of this company", async () => {
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      if (uid === "user-owner-1") return { id: "uc-owner", userId: uid, role: "OWNER", userPermissions: [] };
      return null; // foreign/nonexistent user
    });
    const res = await PATCH(patchReq("u-foreign", { permissions: ["finance.view"] }), makeCtx("u-foreign"));
    expect(res.status).toBe(404);
  });
});

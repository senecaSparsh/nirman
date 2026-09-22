import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, logAction: vi.fn().mockResolvedValue(undefined) };
});

import { DELETE, PATCH } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };
const ADMIN = { role: "ADMIN" as const, id: "user-admin-1" };

function makeCtx(id: string, memberId: string) {
  return { params: Promise.resolve({ id, memberId }) };
}

describe("DELETE /api/companies/[id]/members/[memberId]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" }); // assertCompanyAccess short-circuits on the current company
    // Actor's own membership for getActingRole().
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      const memId = args?.where?.id;
      if (memId === "m-target") return { id: "m-target", userId: "u-target", companyId: "co-1", role: "SITE_ENGINEER", userPermissions: [] };
      if (memId === "m-owner") return { id: "m-owner", userId: "user-owner-1", companyId: "co-1", role: "OWNER", userPermissions: [] };
      if (uid === "user-owner-1") return { id: "m-owner", userId: uid, role: "OWNER", userPermissions: [] };
      return null;
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    mockPrisma().userCompany!.count.mockResolvedValue(2);
    mockPrisma().userPreference!.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma().userCompany!.delete.mockResolvedValue({ id: "m-target" });
    mockPrisma().userCompany!.delete.mockClear();
    mockPrisma().userCompany!.update.mockClear();
  });

  it("removes a member of this company", async () => {
    const res = await DELETE(
      makeRequest("/api/companies/co-1/members/m-target", { method: "DELETE" }),
      makeCtx("co-1", "m-target"),
    );
    expect(res.status).toBe(200);
  });

  it("404s when the membership belongs to another company (was a 500)", async () => {
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id) return null; // company-scoped lookup misses
      const uid = args?.where?.userId_companyId?.userId;
      if (uid === "user-owner-1") return { id: "m-owner", userId: uid, role: "OWNER", userPermissions: [] };
      return null;
    });
    const res = await DELETE(
      makeRequest("/api/companies/co-1/members/m-foreign", { method: "DELETE" }),
      makeCtx("co-1", "m-foreign"),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma().userCompany!.delete).not.toHaveBeenCalled();
  });

  it("blocks removing your own membership (self-lockout)", async () => {
    const res = await DELETE(
      makeRequest("/api/companies/co-1/members/m-owner", { method: "DELETE" }),
      makeCtx("co-1", "m-owner"),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma().userCompany!.delete).not.toHaveBeenCalled();
  });

  it("blocks removing the last OWNER/ADMIN", async () => {
    // An ADMIN touching any tier-1 member now hits the stronger guard first:
    // only the real OWNER may demote/remove a top-level account (403), which
    // also covers this scenario before the last-owner 400 is ever reached.
    setSessionUser(ADMIN);
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const memId = args?.where?.id;
      const uid = args?.where?.userId_companyId?.userId;
      if (memId === "m-owner") return { id: "m-owner", userId: "user-owner-1", companyId: "co-1", role: "OWNER", userPermissions: [] };
      if (uid === "user-admin-1") return { id: "m-admin", userId: uid, role: "ADMIN", userPermissions: [] };
      return null;
    });
    mockPrisma().userCompany!.count.mockResolvedValue(0); // no other tier-1 left
    const res = await DELETE(
      makeRequest("/api/companies/co-1/members/m-owner", { method: "DELETE" }),
      makeCtx("co-1", "m-owner"),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma().userCompany!.delete).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/companies/[id]/members/[memberId]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" }); // assertCompanyAccess short-circuits on the current company
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const uid = args?.where?.userId_companyId?.userId;
      if (args?.where?.id === "m-target") return { id: "m-target", userId: "u-target", role: "SITE_ENGINEER", userPermissions: [] };
      if (uid === "user-owner-1") return { id: "m-owner", userId: uid, role: "OWNER", userPermissions: [] };
      return null;
    });
    mockPrisma().userCompany!.update.mockResolvedValue({ id: "m-target", role: "STORE_KEEPER" });
    mockPrisma().userCompany!.update.mockClear();
  });

  it("changes a member's role", async () => {
    const res = await PATCH(
      makeRequest("/api/companies/co-1/members/m-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("co-1", "m-target"),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a garbage role string (was silently stored as SUPERVISOR)", async () => {
    const res = await PATCH(
      makeRequest("/api/companies/co-1/members/m-target", { method: "PATCH", body: { role: "GARBAGE_ROLE_XYZ" } }),
      makeCtx("co-1", "m-target"),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma().userCompany!.update).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent custom role", async () => {
    mockPrisma().customRole!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/companies/co-1/members/m-target", { method: "PATCH", body: { role: "CUSTOM_NONEXISTENT" } }),
      makeCtx("co-1", "m-target"),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma().userCompany!.update).not.toHaveBeenCalled();
  });
});

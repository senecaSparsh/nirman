import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { PATCH } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/users/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // getCurrentUser() calls user.findUnique by ID for auth.
    // The route also calls user.findUnique by ID for the target user.
    // Distinguish by the ID value.
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane" };
    });
    mockPrisma().user!.count.mockResolvedValue(2);
    mockPrisma().user!.update.mockResolvedValue({
      id: "u-target",
      email: "jane@test.com",
      name: "Jane Updated",
      role: "STORE_KEEPER",
      active: true,
      phone: "9876543210",
      designation: null,
      department: null,
      employeeCode: null,
      companyId: "company-1",
    });
    mockPrisma().companyPhone!.findMany.mockResolvedValue([]);
    mockPrisma().session!.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma().purchaseOrder!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().materialRequisition!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().dailyProgressReport!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().expenseClaim!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().supplierInvoice!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().task!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().projectAssignment!.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma().lead!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().userCompany!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().userCompany!.findMany.mockResolvedValue([]);
    // Company membership check: target user is a member of company-1
    mockPrisma().userCompany!.findFirst.mockResolvedValue({ id: "uc-target" });
  });

  it("updates a user's role and returns { ok: true }", async () => {
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; user: { id: string } }>(res);
    expect(body.ok).toBe(true);
    expect(body.user.id).toBe("u-target");
  });

  it("returns 404 when user is not found", async () => {
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return null; // target user not found
    });
    const res = await PATCH(
      makeRequest("/api/users/nope", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when changing own role (OWNER→ADMIN blocked by canAssignRole)", async () => {
    // Actor is OWNER with id "u-target", target is also OWNER with id "u-target"
    // canAssignRole(OWNER, OWNER) returns false (same tier) → 403 before the last-OWNER guard
    setSessionUser({ ...OWNER, id: "u-target" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "u-target") {
        return { id: "u-target", role: "OWNER", active: true, name: "Owner" };
      }
      return { id: "u-target", role: "OWNER", companyId: "company-1", active: true };
    });
    mockPrisma().user!.count.mockResolvedValue(1);
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "ADMIN" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when demoting another OWNER (canAssignRole blocks same-tier)", async () => {
    // Actor is OWNER (id "user-owner-1"), target is a different OWNER (id "u-owner")
    // canAssignRole(OWNER, OWNER) returns false → 403 before the last-OWNER guard
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-owner", role: "OWNER", active: true, name: "Owner" };
    });
    mockPrisma().user!.count.mockResolvedValue(1);
    const res = await PATCH(
      makeRequest("/api/users/u-owner", { method: "PATCH", body: { role: "ADMIN" } }),
      makeCtx("u-owner"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the user lacks USERS_MANAGE", async () => {
    setSessionUser(SALES_MANAGER);
    // Override findUnique so getCurrentUser() returns SALES_MANAGER role
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "SALES_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane" };
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(401);
  });

  it("deactivates a user and runs cleanup side effects", async () => {
    mockPrisma().session!.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma().task!.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { active: false } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().session!.deleteMany).toHaveBeenCalled();
    expect(mockPrisma().task!.updateMany).toHaveBeenCalled();
  });

  it("returns 404 when target user is not in the actor's company (cross-tenant denial)", async () => {
    // Target user exists but has no membership in the actor's company
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-other", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-2" };
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/users/u-other", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-other"),
    );
    expect(res.status).toBe(404);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

/**
 * POST /api/me/active-role — the multi-role hat switcher.
 *
 * Held set = { membership.role } ∪ secondaryRoles; activeRole = the worn
 * hat. Switching writes activeRole (NULL when switching back to primary).
 * Only already-assigned hats may be selected — no hierarchy check needed
 * because the held set itself is only editable via role-assignment routes.
 */
describe("POST /api/me/active-role", () => {
  beforeEach(() => {
    // HR_MANAGER who also holds a SITE_ENGINEER hat.
    setSessionUser({ role: "HR_MANAGER", id: "u-multi" });
    mockPrisma().userCompany!.findUnique.mockImplementation(async () => ({
      id: "uc-multi",
      role: "HR_MANAGER",
      secondaryRoles: ["SITE_ENGINEER"],
      activeRole: null,
    }));
    // Delegates persist across tests — clear call history so
    // toHaveBeenCalled/not.toHaveBeenCalled assertions stay per-test.
    mockPrisma().userCompany!.update.mockClear();
    mockPrisma().userCompany!.update.mockResolvedValue({});
  });

  it("switches to a held secondary hat and writes activeRole", async () => {
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "SITE_ENGINEER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().userCompany!.update).toHaveBeenCalledWith({
      where: { id: "uc-multi" },
      data: { activeRole: "SITE_ENGINEER" },
    });
    const body = await getJson<{ ok: boolean; activeRole: string; roles: string[] }>(res);
    expect(body.activeRole).toBe("SITE_ENGINEER");
    expect(body.roles).toEqual(expect.arrayContaining(["HR_MANAGER", "SITE_ENGINEER"]));
  });

  it("clears activeRole when switching back to the primary role", async () => {
    // Currently wearing the secondary hat; switching to primary → NULL.
    mockPrisma().userCompany!.findUnique.mockImplementation(async () => ({
      id: "uc-multi",
      role: "HR_MANAGER",
      secondaryRoles: ["SITE_ENGINEER"],
      activeRole: "SITE_ENGINEER",
    }));
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "HR_MANAGER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().userCompany!.update).toHaveBeenCalledWith({
      where: { id: "uc-multi" },
      data: { activeRole: null },
    });
  });

  it("returns 403 when the role is not in the held set", async () => {
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "OWNER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
    expect(mockPrisma().userCompany!.update).not.toHaveBeenCalled();
  });

  it("returns 403 for an unknown/garbage role string", async () => {
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "GARBAGE_XYZ" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("is a no-op when switching to the hat already worn", async () => {
    mockPrisma().userCompany!.findUnique.mockImplementation(async () => ({
      id: "uc-multi",
      role: "HR_MANAGER",
      secondaryRoles: ["SITE_ENGINEER"],
      activeRole: "SITE_ENGINEER",
    }));
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "SITE_ENGINEER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().userCompany!.update).not.toHaveBeenCalled();
  });

  it("single-hat users can only select their primary role", async () => {
    mockPrisma().userCompany!.findUnique.mockImplementation(async () => ({
      id: "uc-solo",
      role: "HR_MANAGER",
      secondaryRoles: [],
      activeRole: null,
    }));
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "SITE_ENGINEER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when role is missing", async () => {
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: {} }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the user has no membership in the company", async () => {
    mockPrisma().userCompany!.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "SITE_ENGINEER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/me/active-role", { method: "POST", body: { role: "SITE_ENGINEER" } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });
});

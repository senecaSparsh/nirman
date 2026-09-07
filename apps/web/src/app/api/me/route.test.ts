import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

describe("GET /api/me", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().user!.findUnique.mockResolvedValue({
      phone: "+91 98765 43210",
      mustChangePassword: false,
      image: null,
      active: true,
      employeeCode: null,
      designation: null,
      department: null,
      joiningDate: null,
      lastLoginAt: null,
    });
  });

  it("returns the current user's info when authenticated", async () => {
    const res = await GET(makeRequest("/api/me"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string; email: string; role: string; phone: string | null }>(res);
    expect(body.id).toBe("user-owner-1");
    expect(body.email).toBe("owner@test.com");
    expect(body.role).toBe("OWNER");
    expect(body.phone).toBe("+91 98765 43210");
  });

  it("returns 401 when not authenticated (apiHandler gate)", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/me"), {});
    expect(res.status).toBe(401);
  });

  it("sets Cache-Control header for client caching", async () => {
    const res = await GET(makeRequest("/api/me"), {});
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("max-age=60");
  });
});

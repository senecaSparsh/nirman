import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("better-auth/crypto", () => ({ hashPassword: vi.fn().mockResolvedValue("hashed-pw") }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function prismaUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u-1",
    email: "jane@test.com",
    name: "Jane Doe",
    role: "SITE_ENGINEER",
    active: true,
    designation: "Engineer",
    employeeCode: "EMP-001",
    department: "Civil",
    ...overrides,
  };
}

describe("GET /api/users", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().user!.findMany.mockResolvedValue([prismaUser()]);
  });

  it("returns 200 with a list of users", async () => {
    const res = await GET(makeRequest("/api/users"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/users"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks USERS_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeRequest("/api/users"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/users", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // Don't override user.findUnique globally — getCurrentUser() relies on it.
    // Instead, use an implementation that returns the session user for ID lookups
    // (auth) and null for email lookups (business logic — no existing user).
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id) {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return null; // email lookup → no existing user
    });
    mockPrisma().user!.findFirst.mockResolvedValue(null);
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    mockPrisma().user!.create.mockResolvedValue({ id: "u-new", name: "New User", email: "new@test.com", role: "SITE_ENGINEER" });
    mockPrisma().userCompany!.create.mockResolvedValue({ id: "uc-1" });
    mockPrisma().account!.create.mockResolvedValue({ id: "acc-1" });
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(
      makeRequest("/api/users", { method: "POST", body: { email: "new@test.com", role: "SITE_ENGINEER" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither email nor phone is provided", async () => {
    const res = await POST(
      makeRequest("/api/users", { method: "POST", body: { name: "New User", role: "SITE_ENGINEER" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid role", async () => {
    const res = await POST(
      makeRequest("/api/users", {
        method: "POST",
        body: { name: "New User", email: "new@test.com", role: "SUPERMAN" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("creates a new user and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/users", {
        method: "POST",
        body: { name: "New User", email: "new@test.com", role: "SITE_ENGINEER", password: "mypassword" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ id: string; name: string; role: string }>(res);
    expect(body.id).toBe("u-new");
    expect(body.name).toBe("New User");
  });

  it("returns 409 when user is already a member of the company", async () => {
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id) {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-existing", name: "Existing", role: "SITE_ENGINEER", active: true };
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue({ id: "uc-1", role: "SITE_ENGINEER" });
    const res = await POST(
      makeRequest("/api/users", {
        method: "POST",
        body: { name: "Existing User", email: "existing@test.com", role: "SITE_ENGINEER" },
      }),
      {},
    );
    expect(res.status).toBe(409);
  });

  it("returns 403 when the user lacks USERS_MANAGE", async () => {
    setSessionUser(SALES_MANAGER);
    // Override the findUnique mock so getCurrentUser() returns the SALES_MANAGER role
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id) {
        return { id: "user-owner-1", role: "SALES_MANAGER", companyId: "company-1", active: true };
      }
      return null;
    });
    const res = await POST(
      makeRequest("/api/users", {
        method: "POST",
        body: { name: "New User", email: "new@test.com", role: "SITE_ENGINEER" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/users", {
        method: "POST",
        body: { name: "New User", email: "new@test.com", role: "SITE_ENGINEER" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

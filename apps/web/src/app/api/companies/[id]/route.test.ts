import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/companies/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().company!.findFirst.mockResolvedValue({ id: "co-1" });
    mockPrisma().company!.findUnique.mockResolvedValue({
      id: "co-1",
      name: "Test Co",
      deletedAt: null,
      parent: null,
      _count: { children: 0, projects: 3, stockLocations: 2 },
    });
  });

  it("returns the company when it is the current company", async () => {
    const res = await GET(makeRequest("/api/companies/company-1"), makeCtx("company-1"));
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.id).toBe("co-1");
  });

  it("returns 404 when company is not found and not a child", async () => {
    // getCompany() uses findFirst with userMemberships in the where clause;
    // the route's own findFirst doesn't. Return the company for getCompany()
    // but null for the route's lookup.
    mockPrisma().company!.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      if (args?.where?.userMemberships) return { id: "company-1", name: "Test Co", currency: "INR", parentCompanyId: null, deletedAt: null };
      return null;
    });
    const res = await GET(makeRequest("/api/companies/nope"), makeCtx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks COMPANY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/companies/company-1"), makeCtx("company-1"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/companies/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().company!.findFirst.mockResolvedValue({ id: "co-1" });
    mockPrisma().company!.update.mockResolvedValue({ id: "co-1", name: "Updated Co" });
  });

  it("updates the company name and returns 200", async () => {
    const res = await PATCH(
      makeRequest("/api/companies/company-1", { method: "PATCH", body: { name: "Updated Co" } }),
      makeCtx("company-1"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.name).toBe("Updated Co");
  });

  it("returns 400 when a company is set as its own parent", async () => {
    const res = await PATCH(
      makeRequest("/api/companies/co-1", { method: "PATCH", body: { parentCompanyId: "co-1" } }),
      makeCtx("co-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await PATCH(
      makeRequest("/api/companies/co-1", { method: "PATCH", body: { email: "not-an-email" } }),
      makeCtx("co-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when company is not found", async () => {
    mockPrisma().company!.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      if (args?.where?.userMemberships) return { id: "company-1", name: "Test Co", currency: "INR", parentCompanyId: null, deletedAt: null };
      return null;
    });
    const res = await PATCH(
      makeRequest("/api/companies/nope", { method: "PATCH", body: { name: "X" } }),
      makeCtx("nope"),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/companies/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().company!.findFirst.mockResolvedValue({ id: "co-1" });
    mockPrisma().company!.findUnique.mockResolvedValue({
      id: "co-1",
      deletedAt: null,
      _count: { children: 0 },
    });
    mockPrisma().company!.update.mockResolvedValue({ id: "co-1" });
  });

  it("soft-deletes the company and returns { ok: true }", async () => {
    const res = await DELETE(makeRequest("/api/companies/company-1", { method: "DELETE" }), makeCtx("company-1"));
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(mockPrisma().company!.update).toHaveBeenCalled();
  });

  it("returns 400 when the company still has children", async () => {
    mockPrisma().company!.findUnique.mockResolvedValue({
      id: "co-1",
      deletedAt: null,
      _count: { children: 2 },
    });
    const res = await DELETE(makeRequest("/api/companies/company-1", { method: "DELETE" }), makeCtx("company-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when company is not found", async () => {
    mockPrisma().company!.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      if (args?.where?.userMemberships) return { id: "company-1", name: "Test Co", currency: "INR", parentCompanyId: null, deletedAt: null };
      return null;
    });
    mockPrisma().company!.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/companies/nope", { method: "DELETE" }), makeCtx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks COMPANY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/companies/company-1", { method: "DELETE" }), makeCtx("company-1"));
    expect(res.status).toBe(403);
  });
});

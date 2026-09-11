import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function prismaProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proj-1",
    name: "Skyline Residency",
    type: "RESIDENTIAL",
    status: "PLANNED",
    address: "123 Park Ave",
    companyId: "company-1",
    deletedAt: null,
    version: 1,
    totalBudget: 50000000,
    costPerSqft: 0,
    totalProjectCost: 0,
    totalSellableArea: 20000,
    phases: [],
    stockLocations: [],
    builtUnits: [{ id: "u1", unitNumber: "101", area: 1200 }],
    _count: { builtUnits: 1, materialIssues: 5, purchaseOrders: 3, landParcels: 2 },
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "proj-1" }) };

describe("GET /api/projects/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().project!.findFirst.mockResolvedValue(prismaProject());
  });

  it("returns 200 with the project and mapped units", async () => {
    const res = await GET(makeRequest("/api/projects/proj-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string; units: unknown[] }>(res);
    expect(body.id).toBe("proj-1");
    expect(body.name).toBe("Skyline Residency");
    expect(body.units).toHaveLength(1);
  });

  it("returns 404 when project not found", async () => {
    mockPrisma().project!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/projects/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/projects/proj-1"), ctx);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/projects/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().project!.findFirst.mockResolvedValue(prismaProject());
    mockPrisma().project!.update.mockResolvedValue(prismaProject({ name: "Updated Project" }));
    mockPrisma().legalDocument!.findFirst.mockResolvedValue(null);
  });

  it("returns 200 with the updated project", async () => {
    const res = await PATCH(
      makeRequest("/api/projects/proj-1", { method: "PATCH", body: { name: "Updated Project" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ name: string }>(res);
    expect(body.name).toBe("Updated Project");
  });

  it("returns 400 on invalid input (empty name)", async () => {
    const res = await PATCH(
      makeRequest("/api/projects/proj-1", { method: "PATCH", body: { name: "" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks PROJECTS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/projects/proj-1", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    mockPrisma().project!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/projects/missing", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/projects/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // The DELETE route calls prisma.project.findFirst for its own guard
    mockPrisma().project!.findFirst.mockResolvedValue({ id: "proj-1" });
    // softDelete("Project") calls prisma.project.findUnique for the guard
    mockPrisma().project!.findUnique.mockResolvedValue(prismaProject({ status: "COMPLETED" }));
    mockPrisma().project!.update.mockResolvedValue(prismaProject({ deletedAt: new Date() }));
  });

  it("returns 200 with ok:true on successful soft delete", async () => {
    const res = await DELETE(makeRequest("/api/projects/proj-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 when project is ACTIVE (cannot delete)", async () => {
    mockPrisma().project!.findUnique.mockResolvedValue(prismaProject({ status: "ACTIVE" }));
    const res = await DELETE(makeRequest("/api/projects/proj-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks PROJECTS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/projects/proj-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});

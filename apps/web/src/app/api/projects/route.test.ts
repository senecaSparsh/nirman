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

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function prismaProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proj-1",
    name: "Skyline Residency",
    type: "RESIDENTIAL",
    status: "ACTIVE",
    address: "123 Park Ave",
    companyId: "company-1",
    deletedAt: null,
    version: 1,
    totalBudget: 50000000,
    costPerSqft: 2500,
    totalProjectCost: 30000000,
    totalSellableArea: 20000,
    _count: { builtUnits: 10, stockLocations: 2, phases: 3 },
    ...overrides,
  };
}

describe("GET /api/projects", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().project!.findMany.mockResolvedValue([prismaProject()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/projects"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "proj-1",
      name: "Skyline Residency",
      unitCount: 10,
      locationCount: 2,
      phaseCount: 3,
    });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/projects"), {});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().project!.create.mockResolvedValue(prismaProject());
    mockPrisma().legalDocument!.create.mockResolvedValue({});
  });

  it("returns 400 on invalid input (missing required name)", async () => {
    const res = await POST(makeRequest("/api/projects", { method: "POST", body: { type: "RESIDENTIAL" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks PROJECTS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(makeRequest("/api/projects", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/projects", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(401);
  });

  it("creates a project and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/projects", { method: "POST", body: { name: "Skyline Residency", type: "RESIDENTIAL" } }),
      {},
    );
    expect(res.status).toBe(201);
    expect(mockPrisma().project!.create).toHaveBeenCalled();
  });

  it("auto-creates a RERA legal doc when reraNumber is provided", async () => {
    const res = await POST(
      makeRequest("/api/projects", {
        method: "POST",
        body: { name: "Skyline", reraNumber: "RERA-123", reraRegistrationDate: "2024-01-01" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    expect(mockPrisma().legalDocument!.create).toHaveBeenCalled();
  });
});

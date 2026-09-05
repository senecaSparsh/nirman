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
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, ServiceError: actual.ServiceError };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };

describe("GET /api/orbit", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // Company node queries
    mockPrisma().company!.findFirst.mockResolvedValue({
      id: "company-1",
      name: "Test Company",
      currency: "INR",
      businessType: "Construction",
      gstin: null,
      pan: null,
      address: null,
      parentCompanyId: null,
      _count: {
        projects: 2, landPurchases: 1, departments: 1, stockLocations: 1,
        employees: 5, equipment: 3, suppliers: 2, customers: 1, vehicles: 2,
        subcontractors: 1, expenses: 4, leads: 3, scrapGenerations: 0, children: 0,
      },
    });
    mockPrisma().project!.count.mockResolvedValue(2);
    mockPrisma().task!.count.mockResolvedValue(5);
    mockPrisma().stockTransfer!.count.mockResolvedValue(1);
    mockPrisma().project!.aggregate.mockResolvedValue({ _sum: { totalProjectCost: null } });
    mockPrisma().stockLocationItem!.aggregate.mockResolvedValue({ _sum: { qty: null } });
    mockPrisma().landParcel!.aggregate.mockResolvedValue({ _sum: { currentValuation: null } });
    mockPrisma().builtUnit!.aggregate.mockResolvedValue({ _sum: { currentValuation: null } });
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
  });

  it("returns 200 with company node when type=company", async () => {
    const res = await GET(makeRequest("/api/orbit?type=company&id=company-1"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; type: string; title: string; orbits: unknown[] }>(res);
    expect(body.type).toBe("company");
    expect(body.title).toBe("Test Company");
    expect(body.orbits.length).toBeGreaterThan(0);
  });

  it("returns 400 when type is missing", async () => {
    const res = await GET(makeRequest("/api/orbit"), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown type", async () => {
    const res = await GET(makeRequest("/api/orbit?type=unknown"), {});
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/orbit?type=company&id=company-1"), {});
    expect(res.status).toBe(401);
  });

  it("returns 400 when children mode is missing params", async () => {
    const res = await GET(makeRequest("/api/orbit?mode=children"), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown children category", async () => {
    const res = await GET(makeRequest("/api/orbit?mode=children&parentType=company&parentId=company-1&category=unknown"), {});
    expect(res.status).toBe(400);
  });

  it("returns 200 with children for projects category", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "proj-1", name: "Green Valley", status: "ACTIVE", type: "RESIDENTIAL", totalProjectCost: null, costPerSqft: null, totalSellableArea: null, _count: { builtUnits: 5 } },
    ]);
    const res = await GET(makeRequest("/api/orbit?mode=children&parentType=company&parentId=company-1&category=projects"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ children: unknown[] }>(res);
    expect(body.children).toHaveLength(1);
  });
});

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

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

describe("GET /api/sellable-assets", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().landParcel!.findMany.mockResolvedValue([]);
    mockPrisma().builtUnit!.findMany.mockResolvedValue([]);
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("returns 200 with an array of sellable assets", async () => {
    const res = await GET(makeRequest("/api/sellable-assets"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 200 with LAND type assets", async () => {
    mockPrisma().landParcel!.findMany.mockResolvedValue([
      {
        id: "lp-1",
        number: "1",
        area: 5000,
        areaUnit: "SQFT",
        status: "AVAILABLE",
        saleId: null,
        acquisitionCost: 1000000,
        askingPrice: 1500000,
        currentValuation: 1400000,
        projectId: "proj-1",
        project: { id: "proj-1", name: "Green Valley", reraNumber: "RERA123" },
        landPurchase: { sellerName: "Seller" },
      },
    ]);
    const res = await GET(makeRequest("/api/sellable-assets?type=LAND"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 200 with BUILT_UNIT type assets", async () => {
    mockPrisma().builtUnit!.findMany.mockResolvedValue([
      {
        id: "bu-1",
        unitNumber: "A-101",
        unitType: "TWO_BHK",
        status: "AVAILABLE",
        saleId: null,
        area: 850,
        areaUnit: "SQFT",
        askingPrice: 5000000,
        productionCost: 3000000,
        currentValuation: 4500000,
        projectId: "proj-1",
        project: { id: "proj-1", name: "Green Valley", reraNumber: "RERA123" },
      },
    ]);
    const res = await GET(makeRequest("/api/sellable-assets?type=BUILT_UNIT"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 200 with PROJECT type assets", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      {
        id: "proj-1",
        name: "Green Valley",
        totalSellableArea: 10000,
        totalProjectCost: 50000000,
        reraNumber: "RERA123",
        builtUnits: [
          { id: "bu-1", status: "AVAILABLE", saleId: null, productionCost: 3000000, area: 850 },
          { id: "bu-2", status: "HOLD", saleId: null, productionCost: 3200000, area: 900 },
        ],
      },
    ]);
    const res = await GET(makeRequest("/api/sellable-assets?type=PROJECT"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/sellable-assets"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks ASSETS_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/sellable-assets"), {});
    expect(res.status).toBe(403);
  });
});

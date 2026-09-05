import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("GET /api/reports/stock-movement-summary", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().stockMovement!.findMany.mockResolvedValue([]);
    mockPrisma().stockLocationItem!.findMany.mockResolvedValue([]);
  });

  it("returns 200 with zero balances when no movements exist", async () => {
    const res = await GET(makeRequest("/api/reports/stock-movement-summary"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ opening: number; received: number; issued: number; balance: number; locationRows: unknown[]; categoryRows: unknown[] }>(res);
    expect(body.opening).toBe(0);
    expect(body.received).toBe(0);
    expect(body.issued).toBe(0);
    expect(body.balance).toBe(0);
    expect(body.locationRows).toHaveLength(0);
    expect(body.categoryRows).toHaveLength(0);
  });

  it("computes opening, received, and issued from stock movements", async () => {
    // inBefore: 2 movements with qty=100, unitCost=50 → openingIn = 10000
    // outBefore: 1 movement with qty=50, unitCost=50 → openingOut = 2500
    // inPeriod: 1 movement with qty=200, unitCost=50 → received = 10000
    // outPeriod: 1 movement with qty=100, unitCost=50 → issued = 5000
    mockPrisma().stockMovement!.findMany
      .mockResolvedValueOnce([{ qty: 100, unitCost: 50, toLocationId: "loc-1", materialId: "m-1" }]) // inBefore
      .mockResolvedValueOnce([{ qty: 50, unitCost: 50, fromLocationId: "loc-1", materialId: "m-1" }]) // outBefore
      .mockResolvedValueOnce([{ // inPeriod
        qty: 200, unitCost: 50, toLocationId: "loc-1", materialId: "m-1",
        material: { id: "m-1", code: "STL", name: "Steel", unit: "KG", category: { name: "Steel" } },
        toLocation: { id: "loc-1", name: "Warehouse", type: "COMPANY_WAREHOUSE" },
      }])
      .mockResolvedValueOnce([{ // outPeriod
        qty: 100, unitCost: 50, fromLocationId: "loc-1", materialId: "m-1",
        material: { id: "m-1", code: "STL", name: "Steel", unit: "KG", category: { name: "Steel" } },
        fromLocation: { id: "loc-1", name: "Warehouse", type: "COMPANY_WAREHOUSE" },
      }]);
    mockPrisma().stockLocationItem!.findMany.mockResolvedValue([
      { qty: 150, movingAvgCost: 50, location: { id: "loc-1", name: "Warehouse", type: "COMPANY_WAREHOUSE" }, material: { id: "m-1", code: "STL", name: "Steel", unit: "KG", category: { name: "Steel" } } },
    ]);
    const res = await GET(makeRequest("/api/reports/stock-movement-summary"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ opening: number; received: number; issued: number; balance: number }>(res);
    // opening = 100*50 - 50*50 = 5000 - 2500 = 2500
    expect(body.opening).toBe(2500);
    // received = 200*50 = 10000
    expect(body.received).toBe(10000);
    // issued = 100*50 = 5000
    expect(body.issued).toBe(5000);
    // balance = 2500 + 10000 - 5000 = 7500
    expect(body.balance).toBe(7500);
  });

  it("returns 403 when the user lacks INVENTORY_VIEW", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/reports/stock-movement-summary"), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/reports/stock-movement-summary"), {});
    expect(res.status).toBe(401);
  });
});

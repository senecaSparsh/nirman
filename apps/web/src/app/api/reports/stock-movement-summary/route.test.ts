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
    // The route aggregates movements via $queryRaw (not findMany) — mock the
    // six raw queries in call order plus the live stockLocationItem fetch.
    mockPrisma().$queryRaw.mockReset().mockResolvedValue([]);
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
    // Six $queryRaw calls run in Promise.all order:
    //   1 openingIn, 2 openingOut, 3 inByLocation, 4 outByLocation,
    //   5 inByCategory, 6 outByCategory
    mockPrisma().$queryRaw
      .mockResolvedValueOnce([{ total: 5000 }]) // openingIn: 100*50
      .mockResolvedValueOnce([{ total: 2500 }]) // openingOut: 50*50
      .mockResolvedValueOnce([{ id: "loc-1", name: "Warehouse", type: "COMPANY_WAREHOUSE", received: 10000 }]) // inByLocation: 200*50
      .mockResolvedValueOnce([{ id: "loc-1", name: "Warehouse", type: "COMPANY_WAREHOUSE", issued: 5000 }])   // outByLocation: 100*50
      .mockResolvedValueOnce([{ categoryName: "Steel", received: 10000 }]) // inByCategory
      .mockResolvedValueOnce([{ categoryName: "Steel", issued: 5000 }]);   // outByCategory
    mockPrisma().stockLocationItem!.findMany.mockResolvedValue([
      { qty: 150, movingAvgCost: 50, location: { id: "loc-1", name: "Warehouse", type: "COMPANY_WAREHOUSE" }, material: { id: "m-1", code: "STL", name: "Steel", unit: "KG", category: { name: "Steel" } } },
    ]);
    const res = await GET(makeRequest("/api/reports/stock-movement-summary"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ opening: number; received: number; issued: number; balance: number }>(res);
    // opening = 5000 - 2500 = 2500
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { authMocks, setSessionUser, clearSession, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function makeNextRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "GET" });
}

describe("GET /api/reports/profit-loss", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().journalLine!.groupBy.mockResolvedValue([]);
    mockPrisma().glAccount!.findMany.mockResolvedValue([]);
  });

  it("returns 200 with an empty P&L when no journal entries exist", async () => {
    const res = await GET(makeNextRequest("/api/reports/profit-loss"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ revenue: unknown[]; expenses: unknown[]; totalRevenue: number; totalExpense: number; grossProfit: number }>(res);
    expect(body.revenue).toHaveLength(0);
    expect(body.expenses).toHaveLength(0);
    expect(body.totalRevenue).toBe(0);
    expect(body.totalExpense).toBe(0);
    expect(body.grossProfit).toBe(0);
  });

  it("computes revenue and expense from grouped journal lines", async () => {
    mockPrisma().journalLine!.groupBy.mockResolvedValue([
      { accountCode: "4001", _sum: { debit: 0, credit: 100000 } },
      { accountCode: "5001", _sum: { debit: 60000, credit: 0 } },
    ]);
    mockPrisma().glAccount!.findMany.mockResolvedValue([
      { code: "4001", name: "Sales Revenue", type: "REVENUE" },
      { code: "5001", name: "Material Cost", type: "EXPENSE" },
    ]);
    const res = await GET(makeNextRequest("/api/reports/profit-loss"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ revenue: Array<{ code: string; balance: number }>; expenses: Array<{ code: string; balance: number }>; totalRevenue: number; totalExpense: number; grossProfit: number }>(res);
    expect(body.revenue).toHaveLength(1);
    expect(body.revenue[0]!.code).toBe("4001");
    expect(body.revenue[0]!.balance).toBe(100000);
    expect(body.expenses).toHaveLength(1);
    expect(body.expenses[0]!.code).toBe("5001");
    expect(body.expenses[0]!.balance).toBe(60000);
    expect(body.totalRevenue).toBe(100000);
    expect(body.totalExpense).toBe(60000);
    expect(body.grossProfit).toBe(40000);
  });

  it("returns 400 for invalid from date", async () => {
    const res = await GET(makeNextRequest("/api/reports/profit-loss?from=not-a-date"), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks FINANCE_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeNextRequest("/api/reports/profit-loss"), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeNextRequest("/api/reports/profit-loss"), {});
    expect(res.status).toBe(401);
  });
});

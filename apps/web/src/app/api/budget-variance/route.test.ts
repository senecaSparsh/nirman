import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

// Helper to simulate Prisma Decimal — the route calls .toNumber() on it.
function dec(n: number) {
  return { toNumber: () => n } as any;
}

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    getBudgetVariance: vi.fn().mockResolvedValue({
      items: [{ budgetedAmount: dec(1000), actualAmount: dec(800), variance: dec(-200), variancePct: dec(-20) }],
      totalBudget: dec(1000),
      totalActual: dec(800),
      totalVariance: dec(-200),
      totalVariancePct: dec(-20),
      boqBudget: dec(600),
      nonBoqBudget: dec(400),
    }),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

describe("GET /api/budget-variance", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 with budget variance data", async () => {
    const res = await GET(makeRequest("/api/budget-variance?projectId=proj-1"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ items: unknown[]; totalBudget: number; totalActual: number }>(res);
    expect(body.items).toHaveLength(1);
    expect(body.totalBudget).toBe(1000);
    expect(body.totalActual).toBe(800);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await GET(makeRequest("/api/budget-variance"), {});
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/budget-variance?projectId=proj-1"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks FINANCE_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/budget-variance?projectId=proj-1"), {});
    expect(res.status).toBe(403);
  });

  it("forwards the active companyId to the service (tenant isolation)", async () => {
    const { getBudgetVariance } = await import("@nirman/services");
    const res = await GET(makeRequest("/api/budget-variance?projectId=proj-1"), {});
    expect(res.status).toBe(200);
    // company-1 is the mock's active company — the service must scope the
    // project lookup by it, or any projectId in the DB would resolve.
    expect(getBudgetVariance).toHaveBeenCalledWith("proj-1", "company-1");
  });

  it("propagates a service-level 404 for a project outside this company", async () => {
    const { getBudgetVariance, ServiceError } = await import("@nirman/services");
    vi.mocked(getBudgetVariance).mockRejectedValueOnce(new ServiceError("Project not found", 404));
    const res = await GET(makeRequest("/api/budget-variance?projectId=foreign-proj"), {});
    expect(res.status).toBe(404);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/not found/i);
  });
});

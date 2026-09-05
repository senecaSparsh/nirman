import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

// Top-level mocks — hoisted by vitest. Must come before imports that pull
// in @/lib/server (which imports @/lib/auth and @nirman/db).
vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
// revalidatePath is called on success — mock it (vitest.setup.ts already
// mocks next/cache globally, but be explicit for clarity in route tests).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

// Suppress console.error from apiHandler during intentional error-path tests.
vi.spyOn(console, "error").mockImplementation(() => {});

// Import AFTER mocks are registered.
import { GET, POST, PUT } from "./route";
import { PERM } from "@/lib/roles";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

// Helper: a material row as Prisma would return it from findMany with includes.
function prismaMaterial(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mat-1",
    code: "STL-001",
    name: "Steel TMT Bars",
    grade: "Fe500D",
    specification: null,
    categoryId: "cat-1",
    unit: "KG",
    hsnCode: "7213",
    gstRate: 18,
    standardCost: 75,
    minStock: 100,
    reorderPoint: null,
    economicOrderQty: null,
    volumetricDensity: null,
    bulkDiscountPct: null,
    isCorporateCommodity: false,
    isLotTracked: false,
    isScrap: false,
    baseUnit: "KG",
    secondaryUnit: null,
    uomConversionFactor: null,
    description: null,
    version: 1,
    category: { id: "cat-1", name: "Steel", unit: "KG" },
    stockItems: [{ qty: 50, movingAvgCost: 70 }],
    ...overrides,
  };
}

describe("GET /api/materials", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findMany.mockResolvedValue([prismaMaterial()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/materials"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ rows: unknown[]; hasMore: boolean; count: number }>(res);
    expect(body.rows).toHaveLength(1);
    expect(body.hasMore).toBe(false);
    expect(body.count).toBe(1);
  });

  it("computes totalQty and totalValue from stockItems", async () => {
    const res = await GET(makeRequest("/api/materials"), {});
    const body = await getJson<{ rows: Array<{ totalQty: number; totalValue: number; lowStock: boolean }> }>(res);
    const row = body.rows[0]!;
    // qty=50, movingAvgCost=70 → totalQty=50, totalValue=3500
    expect(row.totalQty).toBe(50);
    expect(row.totalValue).toBe(3500);
    // minStock=100, totalQty=50 → lowStock=true
    expect(row.lowStock).toBe(true);
  });

  it("respects the limit param and sets hasMore when truncated", async () => {
    // Return 3 rows; limit=2 → hasMore=true, page has 2 rows.
    mockPrisma().material!.findMany.mockResolvedValue([prismaMaterial({ id: "m1" }), prismaMaterial({ id: "m2" }), prismaMaterial({ id: "m3" })]);
    const res = await GET(makeRequest("/api/materials?limit=2"), {});
    const body = await getJson<{ rows: unknown[]; hasMore: boolean }>(res);
    expect(body.rows).toHaveLength(2);
    expect(body.hasMore).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/materials"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user's role lacks INVENTORY_VIEW", async () => {
    // ACCOUNTANT does not have INVENTORY_VIEW — verify the permission gate fires.
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/materials"), {});
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/forbidden|permission/i);
  });
});

describe("POST /api/materials", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().materialCategory!.findUnique.mockResolvedValue({ id: "cat-1", name: "Steel", unit: "KG" });
    mockPrisma().material!.findUnique.mockResolvedValue(null); // no existing
    mockPrisma().material!.create.mockResolvedValue(prismaMaterial());
  });

  it("returns 400 on invalid input (missing required code)", async () => {
    const res = await POST(
      makeRequest("/api/materials", { method: "POST", body: { name: "X" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/materials", {
        method: "POST",
        body: { code: "X-001", name: "X", categoryId: "cat-1", unit: "NOS" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("creates a material and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/materials", {
        method: "POST",
        body: {
          code: "STL-001",
          name: "Steel TMT Bars",
          categoryId: "cat-1",
          unit: "KG",
          gstRate: 18,
          standardCost: 75,
        },
      }),
      {},
    );
    expect(res.status).toBe(201);
    expect(mockPrisma().material!.create).toHaveBeenCalled();
  });

  it("returns 409 when a material with the code already exists (not soft-deleted)", async () => {
    mockPrisma().material!.findUnique.mockResolvedValue({ id: "existing-1", deletedAt: null });
    const res = await POST(
      makeRequest("/api/materials", {
        method: "POST",
        body: { code: "STL-001", name: "Steel", categoryId: "cat-1", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(409);
  });
});

describe("PUT /api/materials (bulk import)", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findUnique.mockResolvedValue(null);
    mockPrisma().material!.create.mockResolvedValue(prismaMaterial());
  });

  it("returns 400 when items is not an array", async () => {
    const res = await PUT(makeRequest("/api/materials", { method: "PUT", body: {} }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PUT(
      makeRequest("/api/materials", { method: "PUT", body: { items: [] } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("creates valid items and skips duplicates", async () => {
    // First item: no existing → created. Second: existing non-deleted → skipped.
    mockPrisma().material!.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dup-1", deletedAt: null });
    const res = await PUT(
      makeRequest("/api/materials", {
        method: "PUT",
        body: {
          items: [
            { code: "NEW-1", name: "New Item", categoryId: "cat-1", unit: "NOS" },
            { code: "DUP-1", name: "Dup Item", categoryId: "cat-1", unit: "NOS" },
          ],
        },
      }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ created: number; skipped: number; errors: unknown[] }>(res);
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.errors).toHaveLength(0);
  });
});

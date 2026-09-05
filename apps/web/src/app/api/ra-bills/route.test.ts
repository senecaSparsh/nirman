import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

// Helper to simulate Prisma Decimal — the route calls toNum() which uses .toNumber().
function dec(n: number) {
  return { toNumber: () => n, toString: () => String(n) } as any;
}

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    createRaBill: vi.fn().mockResolvedValue({ id: "ra-1", raBillNumber: "RA-001" }),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

function prismaRaBill(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ra-1",
    raBillNumber: "RA-001",
    billDate: new Date("2024-01-15"),
    status: "DRAFT",
    grossAmount: dec(100000),
    cumulativeGross: dec(100000),
    retentionAmount: dec(5000),
    tdsAmount: dec(2000),
    advanceRecovery: dec(0),
    otherDeductions: dec(0),
    netPayable: dec(93000),
    workOrder: { id: "wo-1", workOrderNumber: "WO-001", workTitle: "Civil Work", subcontractorId: "sub-1", subcontractor: { name: "ABC Corp" } },
    project: { id: "proj-1", name: "Green Valley" },
    approvedBy: null,
    _count: { lines: 3 },
    ...overrides,
  };
}

describe("GET /api/ra-bills", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().raBill!.findMany.mockResolvedValue([prismaRaBill()]);
  });

  it("returns 200 with mapped RA bills", async () => {
    const res = await GET(makeRequest("/api/ra-bills"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/ra-bills"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks ASSETS_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/ra-bills"), {});
    expect(res.status).toBe(403);
  });

  it("supports workOrderId filter", async () => {
    const res = await GET(makeRequest("/api/ra-bills?workOrderId=wo-1"), {});
    expect(res.status).toBe(200);
  });

  it("returns 404 when work order not found in preview mode", async () => {
    mockPrisma().subcontractorWorkOrder!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/ra-bills?preview=unbilled&workOrderId=wo-99"), {});
    expect(res.status).toBe(404);
  });
});

describe("POST /api/ra-bills", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 400 on invalid input (missing workOrderId)", async () => {
    const res = await POST(
      makeRequest("/api/ra-bills", {
        method: "POST",
        body: { periodFrom: "2024-01-01T00:00:00.000Z", periodTo: "2024-01-31T00:00:00.000Z" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks ASSETS_MANAGE", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await POST(
      makeRequest("/api/ra-bills", {
        method: "POST",
        body: { workOrderId: "wo-1", periodFrom: "2024-01-01T00:00:00.000Z", periodTo: "2024-01-31T00:00:00.000Z" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/ra-bills", {
        method: "POST",
        body: { workOrderId: "wo-1", periodFrom: "2024-01-01T00:00:00.000Z", periodTo: "2024-01-31T00:00:00.000Z" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it("creates an RA bill and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/ra-bills", {
        method: "POST",
        body: { workOrderId: "wo-1", periodFrom: "2024-01-01T00:00:00.000Z", periodTo: "2024-01-31T00:00:00.000Z" },
      }),
      {},
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 on service error", async () => {
    const { createRaBill } = await import("@nirman/services");
    (createRaBill as any).mockRejectedValue(new ServiceError("Work order not found", 404));
    const res = await POST(
      makeRequest("/api/ra-bills", {
        method: "POST",
        body: { workOrderId: "wo-99", periodFrom: "2024-01-01T00:00:00.000Z", periodTo: "2024-01-31T00:00:00.000Z" },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });
});

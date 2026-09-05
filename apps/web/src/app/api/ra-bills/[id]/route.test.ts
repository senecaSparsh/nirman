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
  return {
    ...actual,
    submitRaBill: vi.fn().mockResolvedValue({ id: "ra-1", status: "SUBMITTED" }),
    approveRaBill: vi.fn().mockResolvedValue({ id: "ra-1", status: "APPROVED" }),
    rejectRaBill: vi.fn().mockResolvedValue({ id: "ra-1", status: "REJECTED" }),
    payRaBill: vi.fn().mockResolvedValue({ id: "ra-1", status: "PAID" }),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

function dec(n: number) {
  return { toNumber: () => n, toString: () => String(n) } as any;
}

function prismaRaBillDetail(overrides: Partial<Record<string, unknown>> = {}) {
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
    workOrder: {
      id: "wo-1", workOrderNumber: "WO-001", workTitle: "Civil Work",
      subcontractor: { id: "sub-1", name: "ABC Corp", trade: "CIVIL", gstin: null },
      retentionPct: dec(5), tdsPct: dec(2), tdsCategory: "1", advanceAmount: dec(0), advanceRecoveryPct: dec(0),
    },
    project: { id: "proj-1", name: "Green Valley" },
    lines: [],
    approvedBy: null,
    ...overrides,
  };
}

describe("GET /api/ra-bills/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().raBill!.findFirst.mockResolvedValue(prismaRaBillDetail());
  });

  it("returns 200 with the RA bill detail", async () => {
    const res = await GET(makeRequest("/api/ra-bills/ra-1"), { params: Promise.resolve({ id: "ra-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when RA bill not found", async () => {
    mockPrisma().raBill!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/ra-bills/ra-99"), { params: Promise.resolve({ id: "ra-99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/ra-bills/ra-1"), { params: Promise.resolve({ id: "ra-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks ASSETS_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/ra-bills/ra-1"), { params: Promise.resolve({ id: "ra-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/ra-bills/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 on submit action", async () => {
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "submit" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 on approve action", async () => {
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "approve" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 on reject action without reason", async () => {
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "reject" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on reject action with reason", async () => {
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "reject", reason: "Quality issues" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 on pay action", async () => {
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "pay", paymentMode: "BANK" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 on unknown action", async () => {
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "unknown" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-1", { method: "PATCH", body: { action: "submit" } }),
      { params: Promise.resolve({ id: "ra-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns error status on service error", async () => {
    const { submitRaBill } = await import("@nirman/services");
    (submitRaBill as any).mockRejectedValue(new ServiceError("RA bill not found", 404));
    const res = await PATCH(
      makeRequest("/api/ra-bills/ra-99", { method: "PATCH", body: { action: "submit" } }),
      { params: Promise.resolve({ id: "ra-99" }) },
    );
    expect(res.status).toBe(404);
  });
});

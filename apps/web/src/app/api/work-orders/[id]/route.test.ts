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

import { GET, PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };
const HR_MANAGER = { role: "HR_MANAGER" as const };

function prismaWorkOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "wo-1",
    workOrderNumber: "WO-240901-0001",
    projectId: "proj-1",
    subcontractorId: "sub-1",
    companyId: "company-1",
    status: "DRAFT",
    workTitle: "Plumbing Work",
    description: null,
    retentionPct: 5,
    tdsPct: 2,
    advanceAmount: 0,
    advanceRecoveryPct: 10,
    totalWorkDone: 0,
    totalDeductions: 0,
    totalPaid: 0,
    retentionBalance: 0,
    subcontractor: { id: "sub-1", name: "ABC Constructions", trade: "Plumbing", gstin: null, phone: null, email: null, address: null },
    project: { id: "proj-1", name: "Skyline" },
    phase: null,
    lines: [],
    raBills: [],
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "wo-1" }) };

describe("GET /api/work-orders/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().subcontractorWorkOrder!.findFirst.mockResolvedValue(prismaWorkOrder());
  });

  it("returns 200 with the work order detail", async () => {
    const res = await GET(makeRequest("/api/work-orders/wo-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; workTitle: string }>(res);
    expect(body.id).toBe("wo-1");
    expect(body.workTitle).toBe("Plumbing Work");
  });

  it("returns 404 when work order not found", async () => {
    mockPrisma().subcontractorWorkOrder!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/work-orders/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks ASSETS_VIEW", async () => {
    setSessionUser(HR_MANAGER);
    const res = await GET(makeRequest("/api/work-orders/wo-1"), ctx);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/work-orders/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().subcontractorWorkOrder!.findUnique.mockResolvedValue(prismaWorkOrder({ status: "DRAFT" }));
    mockPrisma().subcontractorWorkOrder!.update.mockResolvedValue(prismaWorkOrder({ status: "ISSUED" }));
  });

  it("returns 200 when issuing a DRAFT work order", async () => {
    const res = await PATCH(
      makeRequest("/api/work-orders/wo-1", { method: "PATCH", body: { action: "issue" } }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 on unknown action", async () => {
    const res = await PATCH(
      makeRequest("/api/work-orders/wo-1", { method: "PATCH", body: { action: "unknown" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks WO_MANAGE for issue action", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/work-orders/wo-1", { method: "PATCH", body: { action: "issue" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/work-orders/wo-1", { method: "PATCH", body: { action: "issue" } }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/work-orders/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().subcontractorWorkOrder!.findFirst.mockResolvedValue(prismaWorkOrder({ status: "DRAFT" }));
    mockPrisma().subcontractorWorkOrderLine!.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma().subcontractorWorkOrder!.delete.mockResolvedValue(prismaWorkOrder());
  });

  it("returns 200 with ok:true on successful delete of DRAFT work order", async () => {
    const res = await DELETE(makeRequest("/api/work-orders/wo-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 when work order is not DRAFT", async () => {
    mockPrisma().subcontractorWorkOrder!.findFirst.mockResolvedValue(prismaWorkOrder({ status: "ISSUED" }));
    const res = await DELETE(makeRequest("/api/work-orders/wo-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when work order not found", async () => {
    mockPrisma().subcontractorWorkOrder!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/work-orders/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks WO_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/work-orders/wo-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});

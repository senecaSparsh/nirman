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

import { GET, POST } from "./route";

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
    createdAt: new Date("2024-09-01"),
    subcontractor: { id: "sub-1", name: "ABC Constructions", trade: "Plumbing" },
    project: { id: "proj-1", name: "Skyline" },
    _count: { raBills: 0, lines: 2 },
    ...overrides,
  };
}

describe("GET /api/work-orders", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().subcontractorWorkOrder!.findMany.mockResolvedValue([prismaWorkOrder()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/work-orders"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "wo-1", workTitle: "Plumbing Work", status: "DRAFT" });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/work-orders"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks ASSETS_VIEW", async () => {
    setSessionUser(HR_MANAGER);
    const res = await GET(makeRequest("/api/work-orders"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/work-orders", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // createWorkOrder checks project, subcontractor, and BOQ items
    mockPrisma().project!.findFirst.mockResolvedValue({ id: "proj-1", companyId: "company-1" });
    mockPrisma().subcontractor!.findFirst.mockResolvedValue({ id: "sub-1", companyId: "company-1" });
    mockPrisma().boqItem!.findMany.mockResolvedValue([{ id: "boq-1" }, { id: "boq-2" }]);
    mockPrisma().numberSequence!.upsert.mockResolvedValue({ nextSeq: 1 });
    mockPrisma().subcontractorWorkOrder!.create.mockResolvedValue({
      id: "wo-1",
      workOrderNumber: "WO-240901-0001",
      lines: [],
    });
  });

  it("returns 400 on invalid input (missing projectId)", async () => {
    const res = await POST(
      makeRequest("/api/work-orders", {
        method: "POST",
        body: { subcontractorId: "sub-1", workTitle: "X", lines: [{ boqItemId: "boq-1", agreedRate: 100 }] },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid input (empty lines)", async () => {
    const res = await POST(
      makeRequest("/api/work-orders", {
        method: "POST",
        body: { projectId: "proj-1", subcontractorId: "sub-1", workTitle: "X", lines: [] },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks ASSETS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/work-orders", {
        method: "POST",
        body: { projectId: "proj-1", subcontractorId: "sub-1", workTitle: "X", lines: [{ boqItemId: "boq-1", agreedRate: 100 }] },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("creates a work order and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/work-orders", {
        method: "POST",
        body: {
          projectId: "proj-1",
          subcontractorId: "sub-1",
          workTitle: "Plumbing Work",
          lines: [{ boqItemId: "boq-1", agreedRate: 100 }],
        },
      }),
      {},
    );
    expect(res.status).toBe(201);
  });
});

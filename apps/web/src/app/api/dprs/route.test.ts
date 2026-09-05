import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    submitDPR: vi.fn().mockResolvedValue({ id: "dpr-1" }),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function prismaDpr(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "dpr-1",
    projectId: "proj-1",
    date: new Date("2024-06-15"),
    weather: "Sunny",
    workSummary: "Foundation work",
    progressPct: 35,
    blockers: null,
    tomorrowPlan: "Continue foundation",
    photoUrls: [],
    approvalStatus: "APPROVED",
    project: { id: "proj-1", name: "Tower A", totalProjectCost: null, costPerSqft: null, totalBudget: null, totalSellableArea: null },
    submittedBy: { id: "u-1", name: "Jane" },
    subAdminApprovedBy: { name: "Sub" },
    adminApprovedBy: { name: "Admin" },
    _count: { materialLines: 2, laborLines: 1 },
    ...overrides,
  };
}

describe("GET /api/dprs", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().dailyProgressReport!.findMany.mockResolvedValue([prismaDpr()]);
  });

  it("returns 200 with a list of DPRs", async () => {
    const res = await GET(makeRequest("/api/dprs"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/dprs"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks DPR_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeRequest("/api/dprs"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/dprs", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 400 for invalid input (missing workSummary)", async () => {
    const res = await POST(
      makeRequest("/api/dprs", {
        method: "POST",
        body: { projectId: "proj-1", date: "2024-06-15" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("submits a DPR and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/dprs", {
        method: "POST",
        body: { projectId: "proj-1", date: "2024-06-15", workSummary: "Foundation work" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("dpr-1");
  });

  it("returns 400 for invalid date format", async () => {
    const res = await POST(
      makeRequest("/api/dprs", {
        method: "POST",
        body: { projectId: "proj-1", date: "not-a-date", workSummary: "Test" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/dprs", {
        method: "POST",
        body: { projectId: "proj-1", date: "2024-06-15", workSummary: "Test" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

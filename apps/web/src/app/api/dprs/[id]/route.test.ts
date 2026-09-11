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
    deleteDpr: vi.fn().mockResolvedValue(undefined),
    subAdminApproveDpr: vi.fn().mockResolvedValue(undefined),
    adminApproveDpr: vi.fn().mockResolvedValue(undefined),
    rejectDpr: vi.fn().mockResolvedValue(undefined),
    resubmitDpr: vi.fn().mockResolvedValue(undefined),
    markDprCostPosted: vi.fn().mockResolvedValue(undefined),
    generateMaterialIssueFromDPR: vi.fn().mockResolvedValue(null),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function prismaDprDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "dpr-1",
    companyId: "company-1",
    projectId: "proj-1",
    date: new Date("2024-06-15"),
    weather: "Sunny",
    workSummary: "Foundation work",
    progressPct: 35,
    blockers: null,
    tomorrowPlan: "Continue",
    notes: null,
    photoUrls: [],
    workType: null,
    workQty: null,
    workUnit: null,
    varianceAnalysis: null,
    autoScrapGenerationId: null,
    approvalStatus: "SUBMITTED",
    subAdminApprovedBy: null,
    subAdminApprovedAt: null,
    adminApprovedBy: null,
    adminApprovedAt: null,
    approvalNotes: null,
    project: { id: "proj-1", name: "Tower A", totalProjectCost: null, costPerSqft: null, totalBudget: null, totalSellableArea: null },
    submittedBy: { id: "u-1", name: "Jane" },
    materialLines: [],
    laborLines: [],
    ...overrides,
  };
}

describe("GET /api/dprs/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().dailyProgressReport!.findFirst.mockResolvedValue(prismaDprDetail());
  });

  it("returns the DPR detail", async () => {
    const res = await GET(makeRequest("/api/dprs/dpr-1"), makeCtx("dpr-1"));
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; projectName: string }>(res);
    expect(body.id).toBe("dpr-1");
    expect(body.projectName).toBe("Tower A");
  });

  it("returns 404 when DPR is not found", async () => {
    mockPrisma().dailyProgressReport!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/dprs/nope"), makeCtx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks DPR_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeRequest("/api/dprs/dpr-1"), makeCtx("dpr-1"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/dprs/[id] — approval actions", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().dailyProgressReport!.findUnique.mockResolvedValue(prismaDprDetail());
  });

  it("sub-admin approves a DPR", async () => {
    const res = await PATCH(
      makeRequest("/api/dprs/dpr-1", { method: "PATCH", body: { action: "subAdminApprove" } }),
      makeCtx("dpr-1"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("admin approves a DPR", async () => {
    const res = await PATCH(
      makeRequest("/api/dprs/dpr-1", { method: "PATCH", body: { action: "adminApprove" } }),
      makeCtx("dpr-1"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("rejects a DPR with a reason", async () => {
    const res = await PATCH(
      makeRequest("/api/dprs/dpr-1", { method: "PATCH", body: { action: "reject", reason: "Incomplete" } }),
      makeCtx("dpr-1"),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when rejecting without a reason", async () => {
    const res = await PATCH(
      makeRequest("/api/dprs/dpr-1", { method: "PATCH", body: { action: "reject" } }),
      makeCtx("dpr-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when DPR is not found", async () => {
    mockPrisma().dailyProgressReport!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/dprs/nope", { method: "PATCH", body: { action: "subAdminApprove" } }),
      makeCtx("nope"),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/dprs/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().dailyProgressReport!.findFirst.mockResolvedValue({ id: "dpr-1" });
  });

  it("deletes a DPR and returns { ok: true }", async () => {
    const res = await DELETE(makeRequest("/api/dprs/dpr-1", { method: "DELETE" }), makeCtx("dpr-1"));
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when DPR is not found", async () => {
    mockPrisma().dailyProgressReport!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/dprs/nope", { method: "DELETE" }), makeCtx("nope"));
    expect(res.status).toBe(404);
  });
});

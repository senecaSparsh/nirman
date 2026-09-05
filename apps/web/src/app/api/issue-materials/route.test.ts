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
    issueMaterialsToProject: vi.fn().mockResolvedValue({ materialIssue: { id: "mi-1", issueNumber: "SA-001" }, totalCost: 500 }),
    issueMaterialsToDepartment: vi.fn().mockResolvedValue({ materialIssue: { id: "mi-1", issueNumber: "SA-001" }, totalCost: 500 }),
    createMaterialIssueRequest: vi.fn().mockResolvedValue({ materialIssue: { id: "mi-1", issueNumber: "SA-001" } }),
    executeMaterialIssue: vi.fn().mockResolvedValue({ totalCost: 500 }),
    recordVehicleTrip: vi.fn().mockResolvedValue(undefined),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST, PATCH } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const PROCUREMENT_MANAGER = { role: "PROCUREMENT_MANAGER" as const };

describe("POST /api/issue-materials", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().stockLocation!.findFirst.mockResolvedValue({ id: "loc-1", name: "Warehouse" });
  });

  it("returns 400 on invalid input (missing fromLocationId)", async () => {
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { projectId: "proj-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither projectId nor departmentId is set", async () => {
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks STOCK_ISSUE", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", projectId: "proj-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", projectId: "proj-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when source location not found", async () => {
    mockPrisma().stockLocation!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-99", projectId: "proj-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });

  it("creates a material issue to project and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", projectId: "proj-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; materialIssueId: string; issueNumber: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.materialIssueId).toBe("mi-1");
  });

  it("creates a material issue to department and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", departmentId: "dept-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(201);
  });

  it("returns 201 with pending=true when requireGatePass is set", async () => {
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", projectId: "proj-1", requireGatePass: true, lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; pending: boolean }>(res);
    expect(body.pending).toBe(true);
  });

  it("returns 400 on service error", async () => {
    const { issueMaterialsToProject } = await import("@nirman/services");
    (issueMaterialsToProject as any).mockRejectedValue(new ServiceError("Insufficient stock", 400));
    const res = await POST(
      makeRequest("/api/issue-materials", {
        method: "POST",
        body: { fromLocationId: "loc-1", projectId: "proj-1", lines: [{ materialId: "mat-1", qty: 10 }] },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/issue-materials (execute pending)", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().materialIssue!.findFirst.mockResolvedValue({ id: "mi-1", status: "PENDING" });
    mockPrisma().materialIssue!.findUnique.mockResolvedValue({
      id: "mi-1",
      vehicleNumber: null,
      vehicleType: null,
      vehiclePhotoUrl: null,
      driverName: null,
      driverPhone: null,
      fromLocationId: "loc-1",
    });
  });

  it("returns 200 on successful execute", async () => {
    const res = await PATCH(
      makeRequest("/api/issue-materials", { method: "PATCH", body: { action: "execute", issueId: "mi-1" } }),
      {},
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when issue not found", async () => {
    mockPrisma().materialIssue!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/issue-materials", { method: "PATCH", body: { action: "execute", issueId: "mi-99" } }),
      {},
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when issue is not PENDING", async () => {
    mockPrisma().materialIssue!.findFirst.mockResolvedValue({ id: "mi-1", status: "COMPLETED" });
    const res = await PATCH(
      makeRequest("/api/issue-materials", { method: "PATCH", body: { action: "execute", issueId: "mi-1" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown action", async () => {
    const res = await PATCH(
      makeRequest("/api/issue-materials", { method: "PATCH", body: { action: "unknown", issueId: "mi-1" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks STOCK_ISSUE", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await PATCH(
      makeRequest("/api/issue-materials", { method: "PATCH", body: { action: "execute", issueId: "mi-1" } }),
      {},
    );
    expect(res.status).toBe(403);
  });
});

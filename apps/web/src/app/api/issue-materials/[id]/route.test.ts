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
    cancelMaterialIssue: vi.fn().mockResolvedValue({ id: "mi-1", status: "CANCELLED" }),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, PATCH } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const PROCUREMENT_MANAGER = { role: "PROCUREMENT_MANAGER" as const };
const FINANCE_HEAD = { role: "FINANCE_HEAD" as const };

function prismaIssue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mi-1",
    issueNumber: "SA-001",
    projectId: "proj-1",
    departmentId: null,
    fromLocationId: "loc-1",
    project: { id: "proj-1", name: "Green Valley" },
    department: null,
    fromLocation: { id: "loc-1", name: "Warehouse" },
    subcontractor: null,
    issuedBy: { id: "user-1", name: "Test Owner" },
    lines: [{ material: { id: "mat-1", code: "STL-001", name: "Steel", unit: "KG" } }],
    ...overrides,
  };
}

describe("GET /api/issue-materials/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().materialIssue!.findFirst.mockResolvedValue(prismaIssue());
  });

  it("returns 200 with the issue detail", async () => {
    const res = await GET(makeRequest("/api/issue-materials/mi-1"), { params: Promise.resolve({ id: "mi-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when issue not found", async () => {
    mockPrisma().materialIssue!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/issue-materials/mi-99"), { params: Promise.resolve({ id: "mi-99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/issue-materials/mi-1"), { params: Promise.resolve({ id: "mi-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks INVENTORY_VIEW", async () => {
    setSessionUser(FINANCE_HEAD);
    const res = await GET(makeRequest("/api/issue-materials/mi-1"), { params: Promise.resolve({ id: "mi-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/issue-materials/[id] (cancel)", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 on successful cancel", async () => {
    const res = await PATCH(
      makeRequest("/api/issue-materials/mi-1", { method: "PATCH", body: { action: "cancel" } }),
      { params: Promise.resolve({ id: "mi-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; status: string }>(res);
    expect(body.status).toBe("CANCELLED");
  });

  it("returns 400 on unknown action", async () => {
    const res = await PATCH(
      makeRequest("/api/issue-materials/mi-1", { method: "PATCH", body: { action: "unknown" } }),
      { params: Promise.resolve({ id: "mi-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks STOCK_ISSUE", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await PATCH(
      makeRequest("/api/issue-materials/mi-1", { method: "PATCH", body: { action: "cancel" } }),
      { params: Promise.resolve({ id: "mi-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/issue-materials/mi-1", { method: "PATCH", body: { action: "cancel" } }),
      { params: Promise.resolve({ id: "mi-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns error status on service error", async () => {
    const { cancelMaterialIssue } = await import("@nirman/services");
    (cancelMaterialIssue as any).mockRejectedValue(new ServiceError("Issue not found", 404));
    const res = await PATCH(
      makeRequest("/api/issue-materials/mi-99", { method: "PATCH", body: { action: "cancel" } }),
      { params: Promise.resolve({ id: "mi-99" }) },
    );
    expect(res.status).toBe(404);
  });
});

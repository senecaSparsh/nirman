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
    recordStockAdjustment: vi.fn().mockResolvedValue({
      movementId: "mov-1",
      movementType: "ADJUSTMENT_IN",
      qty: { toString: () => "100" },
      unitCost: { toString: () => "50" },
      newQty: { toString: () => "100" },
      newMac: { toString: () => "50" },
    }),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("POST /api/materials/[id]/adjust-stock", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findFirst.mockResolvedValue({ id: "mat-1", code: "STL-001", unit: "KG" });
    mockPrisma().stockLocation!.findFirst.mockResolvedValue({ id: "loc-1", name: "Warehouse" });
  });

  it("returns 201 on successful adjustment IN", async () => {
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "IN", qty: 100, reason: "Opening stock" },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; movementId: string }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on invalid input (missing reason)", async () => {
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "IN", qty: 100 },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid direction", async () => {
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "SIDEWAYS", qty: 100, reason: "Test" },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when material not found", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/materials/mat-99/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "IN", qty: 100, reason: "Opening stock" },
      }),
      { params: Promise.resolve({ id: "mat-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when location not found", async () => {
    mockPrisma().stockLocation!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-99", direction: "IN", qty: 100, reason: "Opening stock" },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "IN", qty: 100, reason: "Opening stock" },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "IN", qty: 100, reason: "Opening stock" },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns error status on service error", async () => {
    const { recordStockAdjustment } = await import("@nirman/services");
    (recordStockAdjustment as any).mockRejectedValue(new ServiceError("Insufficient stock", 400));
    const res = await POST(
      makeRequest("/api/materials/mat-1/adjust-stock", {
        method: "POST",
        body: { locationId: "loc-1", direction: "OUT", qty: 100, reason: "Correction" },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(400);
  });
});

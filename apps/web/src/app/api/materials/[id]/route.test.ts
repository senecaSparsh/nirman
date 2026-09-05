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
    softDelete: vi.fn().mockResolvedValue(undefined),
    logAction: vi.fn().mockResolvedValue(undefined),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    extractVersion: actual.extractVersion,
    ConcurrentEditError: actual.ConcurrentEditError,
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { PATCH, DELETE } from "./route";
import { ConcurrentEditError, ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("PATCH /api/materials/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findFirst.mockResolvedValue({ id: "mat-1" });
    mockPrisma().material!.findUnique.mockResolvedValue({ id: "mat-1", version: 1 });
    mockPrisma().material!.update.mockResolvedValue({ id: "mat-1", code: "STL-001", name: "Steel", standardCost: { toString: () => "75" } });
  });

  it("returns 200 on successful update", async () => {
    const res = await PATCH(
      makeRequest("/api/materials/mat-1", { method: "PATCH", body: { name: "Steel TMT" } }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when material not found", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/materials/mat-99", { method: "PATCH", body: { name: "Steel" } }),
      { params: Promise.resolve({ id: "mat-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when code already exists", async () => {
    mockPrisma().material!.findFirst
      .mockResolvedValueOnce({ id: "mat-1" }) // existing check
      .mockResolvedValueOnce({ id: "mat-2" }); // clash check
    const res = await PATCH(
      makeRequest("/api/materials/mat-1", { method: "PATCH", body: { code: "DUP-001" } }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(409);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/materials/mat-1", { method: "PATCH", body: { name: "Steel" } }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/materials/mat-1", { method: "PATCH", body: { name: "Steel" } }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 on concurrent edit (version mismatch)", async () => {
    mockPrisma().material!.findUnique.mockResolvedValue({ id: "mat-1", version: 2 });
    const res = await PATCH(
      makeRequest("/api/materials/mat-1", { method: "PATCH", body: { name: "Steel", version: 1 } }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/materials/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findFirst.mockResolvedValue({ id: "mat-1" });
  });

  it("returns 200 on successful soft delete", async () => {
    const res = await DELETE(
      makeRequest("/api/materials/mat-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when material not found", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("/api/materials/mat-99", { method: "DELETE" }),
      { params: Promise.resolve({ id: "mat-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(
      makeRequest("/api/materials/mat-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await DELETE(
      makeRequest("/api/materials/mat-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

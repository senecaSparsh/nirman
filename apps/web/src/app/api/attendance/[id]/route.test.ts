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
    deleteAttendance: vi.fn().mockResolvedValue(undefined),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
    ServiceError: actual.ServiceError,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { PATCH, DELETE } from "./route";
import { ServiceError } from "@nirman/services";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("PATCH /api/attendance/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().workerAttendance!.findFirst.mockResolvedValue({
      id: "att-1",
      status: "PRESENT",
      date: new Date("2024-01-15T00:00:00.000Z"),
    });
    mockPrisma().workerAttendance!.update.mockResolvedValue({
      id: "att-1",
      status: "HALF_DAY",
      date: new Date("2024-01-15T00:00:00.000Z"),
    });
  });

  it("returns 200 on successful update", async () => {
    const res = await PATCH(
      makeRequest("/api/attendance/att-1", { method: "PATCH", body: { status: "HALF_DAY" } }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on invalid input", async () => {
    const res = await PATCH(
      makeRequest("/api/attendance/att-1", { method: "PATCH", body: { status: "INVALID_STATUS" } }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when attendance record not found", async () => {
    mockPrisma().workerAttendance!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/attendance/att-1", { method: "PATCH", body: { status: "ABSENT" } }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks HR_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/attendance/att-1", { method: "PATCH", body: { status: "ABSENT" } }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/attendance/att-1", { method: "PATCH", body: { status: "ABSENT" } }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/attendance/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 on successful deletion", async () => {
    const { deleteAttendance } = await import("@nirman/services");
    (deleteAttendance as any).mockResolvedValue(undefined);
    const res = await DELETE(
      makeRequest("/api/attendance/att-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 403 when the user lacks HR_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(
      makeRequest("/api/attendance/att-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await DELETE(
      makeRequest("/api/attendance/att-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when attendance record not found", async () => {
    const { deleteAttendance } = await import("@nirman/services");
    (deleteAttendance as any).mockRejectedValue(new ServiceError("Attendance record not found in this company", 404));
    const res = await DELETE(
      makeRequest("/api/attendance/att-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "att-1" }) },
    );
    expect(res.status).toBe(404);
  });
});

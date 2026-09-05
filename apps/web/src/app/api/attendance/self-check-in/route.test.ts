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
    recordAttendance: vi.fn().mockResolvedValue({ id: "att-1" }),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };

function prismaEmployee(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "emp-1",
    userId: "user-owner-1",
    companyId: "company-1",
    deletedAt: null,
    active: true,
    reportingLocation: { id: "loc-1", name: "Site Office", lat: 28.6, lng: 77.2, geoRadius: 500 },
    ...overrides,
  };
}

describe("POST /api/attendance/self-check-in", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().employee!.findFirst.mockResolvedValue(prismaEmployee());
  });

  it("returns 201 on successful check-in", async () => {
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string; geoFenceOk: boolean | undefined }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on invalid input (missing employeeId)", async () => {
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid date format", async () => {
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { employeeId: "emp-1", date: "not-a-date", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when employee not found", async () => {
    mockPrisma().employee!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { employeeId: "emp-99", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not linked to the employee", async () => {
    mockPrisma().employee!.findFirst.mockResolvedValue(prismaEmployee({ userId: "other-user" }));
    // Second findFirst (for userEmployee) also returns null
    mockPrisma().employee!.findFirst
      .mockResolvedValueOnce(prismaEmployee({ userId: "other-user" }))
      .mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

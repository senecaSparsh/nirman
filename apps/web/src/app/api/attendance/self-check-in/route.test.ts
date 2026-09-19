import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  setCompany,
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
    // SITE_ENGINEER lacks HR_MANAGE, so isManager is false → 403 (not 201)
    setSessionUser({ role: "SITE_ENGINEER" });
    mockPrisma().employee!.findFirst.mockResolvedValue(prismaEmployee({ userId: "other-user" }));
    const res = await POST(
      makeRequest("/api/attendance/self-check-in", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("falls back to the company HQ geofence when no reporting location is assigned", async () => {
    setCompany({ lat: 28.6, lng: 77.2, geoRadius: 100 });
    mockPrisma().employee!.findFirst.mockResolvedValue(
      prismaEmployee({ reportingLocation: null, reportingLocationId: null }),
    );
    try {
      const res = await POST(
        makeRequest("/api/attendance/self-check-in", {
          method: "POST",
          body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
        }),
        {},
      );
      expect(res.status).toBe(201);
      const body = await getJson<{ geoFenceOk: boolean; geoFenceDistance: number; reportingLocation: string | null }>(res);
      expect(body.geoFenceOk).toBe(true);
      expect(body.geoFenceDistance).toBe(0);
      expect(body.reportingLocation).toBe("Test Company — Head Office");
    } finally {
      setCompany(); // reset to defaults — company state is module-level
    }
  });

  it("flags check-ins outside the company HQ geofence fallback", async () => {
    setCompany({ lat: 28.6, lng: 77.2, geoRadius: 100 });
    mockPrisma().employee!.findFirst.mockResolvedValue(
      prismaEmployee({ reportingLocation: null, reportingLocationId: null }),
    );
    try {
      // ~1.1km away — outside the 100m fence
      const res = await POST(
        makeRequest("/api/attendance/self-check-in", {
          method: "POST",
          body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.61, checkInLng: 77.2 },
        }),
        {},
      );
      const body = await getJson<{ geoFenceOk: boolean; geoFenceDistance: number }>(res);
      expect(body.geoFenceOk).toBe(false);
      expect(body.geoFenceDistance).toBeGreaterThan(100);
    } finally {
      setCompany();
    }
  });

  it("assigned reporting location wins over the company HQ geofence", async () => {
    // Company fence is far away + tiny; the assigned site is at the check-in point.
    setCompany({ lat: 0, lng: 0, geoRadius: 10 });
    mockPrisma().employee!.findFirst.mockResolvedValue(prismaEmployee());
    try {
      const res = await POST(
        makeRequest("/api/attendance/self-check-in", {
          method: "POST",
          body: { employeeId: "emp-1", date: "2024-01-15", checkInLat: 28.6, checkInLng: 77.2 },
        }),
        {},
      );
      const body = await getJson<{ geoFenceOk: boolean; reportingLocation: string | null }>(res);
      expect(body.geoFenceOk).toBe(true);
      expect(body.reportingLocation).toBe("Site Office");
    } finally {
      setCompany();
    }
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

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
    bulkRecordAttendance: vi.fn().mockResolvedValue([{ id: "att-1" }]),
    combineTimeWithDate: vi.fn((d: Date, t: string) => new Date(`${d.toISOString().slice(0, 10)}T${t}`)),
    computeAttendanceTier: vi.fn(() => "GREEN"),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };
const PROCUREMENT_MANAGER = { role: "PROCUREMENT_MANAGER" as const };

function prismaAttendance(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "att-1",
    employeeId: "emp-1",
    date: new Date("2024-01-15T00:00:00.000Z"),
    projectId: "proj-1",
    checkIn: new Date("2024-01-15T09:00:00.000Z"),
    checkOut: new Date("2024-01-15T17:00:00.000Z"),
    hoursWorked: 8,
    status: "PRESENT",
    notes: null,
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    checkInLocation: null,
    checkOutLocation: null,
    geoFenceOk: null,
    geoFenceDistance: null,
    employee: { id: "emp-1", name: "Ramesh", trade: "MASON" },
    project: { id: "proj-1", name: "Green Valley" },
    ...overrides,
  };
}

describe("GET /api/attendance", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().workerAttendance!.findMany.mockResolvedValue([prismaAttendance()]);
    mockPrisma().dailyProgressReport!.findMany.mockResolvedValue([]);
  });

  it("returns 200 with mapped attendance rows", async () => {
    const res = await GET(makeRequest("/api/attendance"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/attendance"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks HR_VIEW", async () => {
    setSessionUser(PROCUREMENT_MANAGER);
    const res = await GET(makeRequest("/api/attendance"), {});
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid date format", async () => {
    const res = await GET(makeRequest("/api/attendance?date=not-a-date"), {});
    expect(res.status).toBe(400);
  });

  it("supports date range filtering", async () => {
    const res = await GET(makeRequest("/api/attendance?startDate=2024-01-01&endDate=2024-01-31"), {});
    expect(res.status).toBe(200);
  });

  it("returns 400 on invalid date range format", async () => {
    const res = await GET(makeRequest("/api/attendance?startDate=bad&endDate=2024-01-31"), {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/attendance", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 400 on invalid input (missing employeeId)", async () => {
    const res = await POST(
      makeRequest("/api/attendance", { method: "POST", body: { date: "2024-01-15", status: "PRESENT" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks HR_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/attendance", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", status: "PRESENT" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/attendance", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", status: "PRESENT" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it("creates a single attendance record and returns 201", async () => {
    const { recordAttendance } = await import("@nirman/services");
    (recordAttendance as any).mockResolvedValue({ id: "att-new" });
    const res = await POST(
      makeRequest("/api/attendance", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", status: "PRESENT" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("att-new");
  });

  it("creates bulk attendance records and returns 201", async () => {
    const { bulkRecordAttendance } = await import("@nirman/services");
    (bulkRecordAttendance as any).mockResolvedValue([{ id: "att-1" }, { id: "att-2" }]);
    const res = await POST(
      makeRequest("/api/attendance", {
        method: "POST",
        body: {
          date: "2024-01-15",
          records: [
            { employeeId: "emp-1", status: "PRESENT" },
            { employeeId: "emp-2", status: "ABSENT" },
          ],
        },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; results: unknown[] }>(res);
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(2);
  });

  it("returns 400 on invalid bulk date", async () => {
    const res = await POST(
      makeRequest("/api/attendance", {
        method: "POST",
        body: { date: "bad-date", records: [{ employeeId: "emp-1", status: "PRESENT" }] },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });
});

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

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };

describe("POST /api/attendance/self-check-out", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().workerAttendance!.findUnique.mockResolvedValue({
      id: "att-1",
      checkIn: new Date("2024-01-15T09:00:00.000Z"),
      status: "PRESENT",
    });
    mockPrisma().workerAttendance!.update.mockResolvedValue({ id: "att-1" });
  });

  it("returns 200 on successful check-out", async () => {
    const res = await POST(
      makeRequest("/api/attendance/self-check-out", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkOutLat: 28.6, checkOutLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on invalid input (missing employeeId)", async () => {
    const res = await POST(
      makeRequest("/api/attendance/self-check-out", {
        method: "POST",
        body: { date: "2024-01-15", checkOutLat: 28.6, checkOutLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid date format", async () => {
    const res = await POST(
      makeRequest("/api/attendance/self-check-out", {
        method: "POST",
        body: { employeeId: "emp-1", date: "bad-date", checkOutLat: 28.6, checkOutLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no check-in found for today", async () => {
    mockPrisma().workerAttendance!.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/attendance/self-check-out", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkOutLat: 28.6, checkOutLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/attendance/self-check-out", {
        method: "POST",
        body: { employeeId: "emp-1", date: "2024-01-15", checkOutLat: 28.6, checkOutLng: 77.2 },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

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

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function prismaCall(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "call-1",
    direction: "OUTBOUND",
    fromNumber: "919876543210",
    toNumber: "919812345678",
    status: "ANSWERED",
    startedAt: new Date("2024-09-01T10:00:00Z"),
    durationSec: 120,
    companyId: "company-1",
    deletedAt: null,
    callerUserId: "user-owner-1",
    companyPhone: { id: "cp-1", phoneNumber: "+919876543210", label: "Main" },
    caller: { id: "user-owner-1", name: "Test Owner" },
    callee: null,
    recording: null,
    voicemail: null,
    tags: [],
    _count: { callNotes: 0 },
    ...overrides,
  };
}

describe("GET /api/calls", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findMany.mockResolvedValue([prismaCall()]);
    mockPrisma().callLog!.count.mockResolvedValue(1);
  });

  it("returns 200 with paginated call data", async () => {
    const res = await GET(makeRequest("/api/calls"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ data: unknown[]; total: number; page: number; limit: number }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/calls"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks CALL_VIEW", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/calls"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/calls", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.create.mockResolvedValue(prismaCall());
  });

  it("returns 400 when direction is missing", async () => {
    const res = await POST(makeRequest("/api/calls", { method: "POST", body: { otherNumber: "9876543210" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 when direction is invalid", async () => {
    const res = await POST(
      makeRequest("/api/calls", { method: "POST", body: { direction: "INVALID", otherNumber: "9876543210" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when call parties cannot be determined", async () => {
    const res = await POST(
      makeRequest("/api/calls", { method: "POST", body: { direction: "OUTBOUND" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks CALL_CREATE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/calls", { method: "POST", body: { direction: "OUTBOUND", otherNumber: "9876543210" } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/calls", { method: "POST", body: { direction: "OUTBOUND", otherNumber: "9876543210" } }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it("creates a call log and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/calls", {
        method: "POST",
        body: { direction: "OUTBOUND", otherNumber: "9876543210", durationSec: 60 },
      }),
      {},
    );
    expect(res.status).toBe(201);
    expect(mockPrisma().callLog!.create).toHaveBeenCalled();
  });

  it("returns 404 when companyPhoneId not found", async () => {
    mockPrisma().companyPhone!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/calls", {
        method: "POST",
        body: { direction: "OUTBOUND", otherNumber: "9876543210", companyPhoneId: "missing" },
      }),
      {},
    );
    expect(res.status).toBe(404);
  });
});

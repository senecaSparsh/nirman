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

import { GET, PATCH, DELETE } from "./route";

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
    calleeUserId: null,
    disposition: null,
    notes: null,
    legalHold: false,
    companyPhone: { id: "cp-1", phoneNumber: "+919876543210", label: "Main", department: null },
    caller: { id: "user-owner-1", name: "Test Owner", email: "owner@test.com" },
    callee: null,
    recording: null,
    voicemail: null,
    callNotes: [],
    tags: [],
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "call-1" }) };

describe("GET /api/calls/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findFirst.mockResolvedValue(prismaCall());
  });

  it("returns 200 with the call detail", async () => {
    const res = await GET(makeRequest("/api/calls/call-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; direction: string }>(res);
    expect(body.id).toBe("call-1");
    expect(body.direction).toBe("OUTBOUND");
  });

  it("returns 404 when call not found", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/calls/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks CALL_VIEW", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/calls/call-1"), ctx);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/calls/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findFirst.mockResolvedValue(prismaCall());
    mockPrisma().callLog!.update.mockResolvedValue(prismaCall({ disposition: "INTERESTED", notes: "Follow up" }));
  });

  it("returns 200 with the updated call", async () => {
    const res = await PATCH(
      makeRequest("/api/calls/call-1", { method: "PATCH", body: { disposition: "INTERESTED", notes: "Follow up" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().callLog!.update).toHaveBeenCalled();
  });

  it("returns 404 when call not found", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/calls/missing", { method: "PATCH", body: { notes: "X" } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks CALL_EDIT", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/calls/call-1", { method: "PATCH", body: { notes: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/calls/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findFirst.mockResolvedValue(prismaCall());
    mockPrisma().callLog!.update.mockResolvedValue(prismaCall({ deletedAt: new Date() }));
  });

  it("returns 200 with ok:true on successful soft delete", async () => {
    const res = await DELETE(makeRequest("/api/calls/call-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when call not found", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/calls/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks CALL_DELETE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/calls/call-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});

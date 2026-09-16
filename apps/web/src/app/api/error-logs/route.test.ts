import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, createInAppNotification: vi.fn().mockResolvedValue(undefined), logAction: vi.fn().mockResolvedValue(undefined) };
});

import { POST, GET, PATCH } from "./route";

const DEV = { role: "DEVELOPER" as const };
const MANAGER = { role: "PROJECT_MANAGER" as const };
const EMPTY_CTX = {} as never;

const ERR = {
  type: "error",
  message: "Cannot read properties of undefined (reading 'findMany')",
  url: "https://nirman.life/m/sales",
  stack: "Error: x\n    at Page (https://nirman.life/_next/static/chunks/abc.js:1:1)",
};

beforeEach(() => {
  setSessionUser(DEV);
  // recordError looks up the signature row via findUnique({ fingerprint })
  mockPrisma().errorLog!.findUnique.mockClear().mockResolvedValue(null);
  mockPrisma().errorLog!.create.mockClear().mockResolvedValue({ id: "el-1" });
  mockPrisma().errorLog!.update.mockClear().mockResolvedValue({ id: "el-1", resolvedAt: new Date() });
  mockPrisma().errorLog!.findMany.mockClear();
  mockPrisma().errorLog!.count.mockClear();
});

describe("POST /api/error-logs", () => {
  it("creates a new signature row for a novel error", async () => {
    const res = await POST(makeRequest("/api/error-logs", { method: "POST", body: { errors: [ERR] } }), EMPTY_CTX);
    expect(res.status).toBe(201);
    const d = await getJson<{ signatures: number; newSignatures: number }>(res);
    expect(d.signatures).toBe(1);
    expect(d.newSignatures).toBe(1);
    expect(mockPrisma().errorLog!.create).toHaveBeenCalledOnce();
  });

  it("dedupes a repeat occurrence — bumps the existing row, no create", async () => {
    mockPrisma().errorLog!.findUnique.mockResolvedValue({ id: "el-1", resolvedAt: null, occurrenceCount: 4 });
    const res = await POST(makeRequest("/api/error-logs", { method: "POST", body: { errors: [ERR] } }), EMPTY_CTX);
    const d = await getJson<{ newSignatures: number }>(res);
    expect(d.newSignatures).toBe(0);
    expect(mockPrisma().errorLog!.create).not.toHaveBeenCalled();
    expect(mockPrisma().errorLog!.update).toHaveBeenCalled();
  });

  it("collapses a batch of identical errors into one signature update", async () => {
    const res = await POST(makeRequest("/api/error-logs", {
      method: "POST",
      body: { errors: [ERR, ERR, ERR, ERR] },
    }), EMPTY_CTX);
    const d = await getJson<{ signatures: number; newSignatures: number }>(res);
    expect(d.signatures).toBe(1);
    // One create call carrying occurrences=4, not four creates.
    expect(mockPrisma().errorLog!.create).toHaveBeenCalledOnce();
    const created = mockPrisma().errorLog!.create.mock.calls.at(-1)![0] as { data: { occurrenceCount: number } };
    expect(created.data.occurrenceCount).toBe(4);
  });

  it("reopens a resolved signature on recurrence", async () => {
    mockPrisma().errorLog!.findUnique.mockResolvedValue({
      id: "el-1", resolvedAt: new Date(), occurrenceCount: 9, reopenedCount: 0,
    });
    const res = await POST(makeRequest("/api/error-logs", { method: "POST", body: { errors: [ERR] } }), EMPTY_CTX);
    const d = await getJson<{ reopened: number }>(res);
    expect(d.reopened).toBe(1);
    const upd = mockPrisma().errorLog!.update.mock.calls.at(-1)![0];
    expect(upd.data.resolvedAt).toBeNull();
    expect(upd.data.reopenedCount).toEqual({ increment: 1 });
  });

  it("accepts anonymous telemetry (sign-in page crashes)", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/error-logs", { method: "POST", body: { errors: [ERR] } }), EMPTY_CTX);
    expect(res.status).toBe(201);
    setSessionUser(DEV);
  });

  it("rejects an empty batch", async () => {
    const res = await POST(makeRequest("/api/error-logs", { method: "POST", body: { errors: [] } }), EMPTY_CTX);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/error-logs", () => {
  it("is developer-only", async () => {
    setSessionUser(MANAGER);
    const res = await GET(makeRequest("/api/error-logs"), EMPTY_CTX);
    expect(res.status).toBe(403);
    setSessionUser(DEV);
  });

  it("lists open signatures for the developer", async () => {
    mockPrisma().errorLog!.findMany.mockResolvedValue([
      { id: "el-1", message: "x", type: "error", source: "client", occurrenceCount: 3, resolvedAt: null, lastSeenAt: new Date(), firstSeenAt: new Date(), createdAt: new Date(), url: "/m/sales", user: null, company: null, resolvedBy: null, fingerprint: "fp", filename: null, lineno: null, colno: null, stack: null, userAgent: null },
    ]);
    mockPrisma().errorLog!.count.mockResolvedValue(1);
    const res = await GET(makeRequest("/api/error-logs?status=open"), EMPTY_CTX);
    expect(res.status).toBe(200);
    const d = await getJson<{ errors: { id: string }[]; openCount: number }>(res);
    expect(d.errors).toHaveLength(1);
    // The open filter excludes resolved rows at the query level.
    const where = mockPrisma().errorLog!.findMany.mock.calls.at(-1)![0].where;
    expect(where.resolvedAt).toBeNull();
  });
});

describe("PATCH /api/error-logs", () => {
  it("is developer-only", async () => {
    setSessionUser(MANAGER);
    const res = await PATCH(makeRequest("/api/error-logs", { method: "PATCH", body: { id: "el-1", action: "resolve" } }), EMPTY_CTX);
    expect(res.status).toBe(403);
    setSessionUser(DEV);
  });

  it("resolves a signature", async () => {
    const res = await PATCH(makeRequest("/api/error-logs", { method: "PATCH", body: { id: "el-1", action: "resolve" } }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const upd = mockPrisma().errorLog!.update.mock.calls.at(-1)![0];
    expect(upd.data.resolvedAt).toBeInstanceOf(Date);
    expect(upd.data.resolvedById).toBeTruthy();
  });

  it("rejects unknown actions", async () => {
    const res = await PATCH(makeRequest("/api/error-logs", { method: "PATCH", body: { id: "el-1", action: "delete" } }), EMPTY_CTX);
    expect(res.status).toBe(400);
  });
});

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
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("POST /api/calls/[id]/notes", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findFirst.mockResolvedValue({ id: "call-1" });
    mockPrisma().callNote!.create.mockResolvedValue({
      id: "note-1",
      note: "Test note",
      user: { id: "user-owner-1", name: "Test Owner" },
    });
  });

  it("returns 201 on successful note creation", async () => {
    const res = await POST(
      makeRequest("/api/calls/call-1/notes", { method: "POST", body: { note: "Test note" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 when note is missing", async () => {
    const res = await POST(
      makeRequest("/api/calls/call-1/notes", { method: "POST", body: {} }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when note is empty string", async () => {
    const res = await POST(
      makeRequest("/api/calls/call-1/notes", { method: "POST", body: { note: "  " } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when call not found", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/calls/call-99/notes", { method: "POST", body: { note: "Test" } }),
      { params: Promise.resolve({ id: "call-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks CALL_EDIT", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/calls/call-1/notes", { method: "POST", body: { note: "Test" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/calls/call-1/notes", { method: "POST", body: { note: "Test" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

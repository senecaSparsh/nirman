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

import { POST, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("POST /api/calls/[id]/tags", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callLog!.findFirst.mockResolvedValue({ id: "call-1" });
    mockPrisma().callTag!.findUnique.mockResolvedValue(null);
    mockPrisma().callTag!.create.mockResolvedValue({ id: "tag-1", name: "Important", color: "#ff0000" });
    mockPrisma().callLogTag!.findUnique.mockResolvedValue(null);
    mockPrisma().callLogTag!.create.mockResolvedValue({ callLogId: "call-1", callTagId: "tag-1" });
  });

  it("returns 201 on successful tag creation", async () => {
    const res = await POST(
      makeRequest("/api/calls/call-1/tags", { method: "POST", body: { name: "Important" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; tag: { id: string } }>(res);
    expect(body.ok).toBe(true);
    expect(body.tag.id).toBe("tag-1");
  });

  it("returns 400 when tag name is missing", async () => {
    const res = await POST(
      makeRequest("/api/calls/call-1/tags", { method: "POST", body: {} }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when call not found", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/calls/call-99/tags", { method: "POST", body: { name: "Important" } }),
      { params: Promise.resolve({ id: "call-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 when tag already applied", async () => {
    mockPrisma().callTag!.findUnique.mockResolvedValue({ id: "tag-1", name: "Important", color: "#ff0000" });
    mockPrisma().callLogTag!.findUnique.mockResolvedValue({ callLogId: "call-1", callTagId: "tag-1" });
    const res = await POST(
      makeRequest("/api/calls/call-1/tags", { method: "POST", body: { name: "Important" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 when the user lacks CALL_EDIT", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/calls/call-1/tags", { method: "POST", body: { name: "Important" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/calls/call-1/tags", { method: "POST", body: { name: "Important" } }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/calls/[id]/tags", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().callTag!.findFirst.mockResolvedValue({ id: "tag-1", name: "Important" });
    mockPrisma().callLogTag!.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("returns 200 on successful tag removal via query param", async () => {
    const res = await DELETE(
      makeRequest("/api/calls/call-1/tags?tagId=tag-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when neither tagId nor name is provided", async () => {
    const res = await DELETE(
      makeRequest("/api/calls/call-1/tags", { method: "DELETE" }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when tag not found", async () => {
    mockPrisma().callTag!.findFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("/api/calls/call-1/tags?tagId=tag-99", { method: "DELETE" }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks CALL_EDIT", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(
      makeRequest("/api/calls/call-1/tags?tagId=tag-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await DELETE(
      makeRequest("/api/calls/call-1/tags?tagId=tag-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "call-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

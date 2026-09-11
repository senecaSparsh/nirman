import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    updateWbsNode: vi.fn().mockResolvedValue({ id: "wbs-1", code: "1.1", name: "Updated Name" }),
    deleteWbsNode: vi.fn().mockResolvedValue(undefined),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/wbs/nodes/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().wbsNode!.findFirst.mockResolvedValue({ id: "wbs-1" });
  });

  it("updates a WBS node and returns 200", async () => {
    const res = await PATCH(
      makeRequest("/api/wbs/nodes/wbs-1", { method: "PATCH", body: { name: "Updated Name" } }),
      makeCtx("wbs-1"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.name).toBe("Updated Name");
  });

  it("returns 403 when the user lacks WBS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/wbs/nodes/wbs-1", { method: "PATCH", body: { name: "X" } }),
      makeCtx("wbs-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/wbs/nodes/wbs-1", { method: "PATCH", body: { name: "X" } }),
      makeCtx("wbs-1"),
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/wbs/nodes/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().wbsNode!.findFirst.mockResolvedValue({ id: "wbs-1" });
  });

  it("deletes a WBS node and returns { ok: true }", async () => {
    const res = await DELETE(makeRequest("/api/wbs/nodes/wbs-1", { method: "DELETE" }), makeCtx("wbs-1"));
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 403 when the user lacks WBS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/wbs/nodes/wbs-1", { method: "DELETE" }), makeCtx("wbs-1"));
    expect(res.status).toBe(403);
  });
});

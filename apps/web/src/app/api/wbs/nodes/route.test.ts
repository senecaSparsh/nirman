import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    createWbsNode: vi.fn().mockResolvedValue({ id: "wbs-1", code: "1.1", name: "Foundation" }),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("POST /api/wbs/nodes", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("creates a WBS node and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/wbs/nodes", {
        method: "POST",
        body: { projectId: "proj-1", code: "1.1", name: "Foundation" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ id: string; code: string; name: string }>(res);
    expect(body.id).toBe("wbs-1");
    expect(body.code).toBe("1.1");
  });

  it("returns 400 for invalid input (missing code)", async () => {
    const res = await POST(
      makeRequest("/api/wbs/nodes", {
        method: "POST",
        body: { projectId: "proj-1", name: "Foundation" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid input (missing projectId)", async () => {
    const res = await POST(
      makeRequest("/api/wbs/nodes", {
        method: "POST",
        body: { code: "1.1", name: "Foundation" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks WBS_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/wbs/nodes", {
        method: "POST",
        body: { projectId: "proj-1", code: "1.1", name: "Foundation" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/wbs/nodes", {
        method: "POST",
        body: { projectId: "proj-1", code: "1.1", name: "Foundation" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

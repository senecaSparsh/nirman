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
    generateMaterialCode: vi.fn().mockResolvedValue("STL-001"),
    previewMaterialCode: vi.fn().mockReturnValue("STL-PREVIEW"),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("GET /api/materials/auto-code", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 with a preview code", async () => {
    const res = await GET(makeRequest("/api/materials/auto-code?categoryName=Steel"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ preview: string }>(res);
    expect(body.preview).toBe("STL-PREVIEW");
  });

  it("returns 400 when categoryName is missing", async () => {
    const res = await GET(makeRequest("/api/materials/auto-code"), {});
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/materials/auto-code?categoryName=Steel"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks INVENTORY_VIEW", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/materials/auto-code?categoryName=Steel"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/materials/auto-code", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 with a generated code", async () => {
    const res = await POST(
      makeRequest("/api/materials/auto-code", { method: "POST", body: { categoryName: "Steel" } }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ code: string }>(res);
    expect(body.code).toBe("STL-001");
  });

  it("returns 400 when categoryName is missing", async () => {
    const res = await POST(makeRequest("/api/materials/auto-code", { method: "POST", body: {} }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/materials/auto-code", { method: "POST", body: { categoryName: "Steel" } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/materials/auto-code", { method: "POST", body: { categoryName: "Steel" } }),
      {},
    );
    expect(res.status).toBe(401);
  });
});

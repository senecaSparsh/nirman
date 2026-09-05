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
    quickCreateMaterial: vi.fn().mockResolvedValue({ id: "mat-1", code: "STL-001", name: "Steel TMT" }),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("POST /api/materials/quick-create", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 201 on successful quick-create", async () => {
    const res = await POST(
      makeRequest("/api/materials/quick-create", {
        method: "POST",
        body: { name: "Steel TMT", categoryId: "cat-1", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 on invalid input (missing name)", async () => {
    const res = await POST(
      makeRequest("/api/materials/quick-create", {
        method: "POST",
        body: { categoryId: "cat-1", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid input (missing categoryId)", async () => {
    const res = await POST(
      makeRequest("/api/materials/quick-create", {
        method: "POST",
        body: { name: "Steel TMT", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/materials/quick-create", {
        method: "POST",
        body: { name: "Steel TMT", categoryId: "cat-1", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/materials/quick-create", {
        method: "POST",
        body: { name: "Steel TMT", categoryId: "cat-1", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 when material already exists", async () => {
    const { quickCreateMaterial } = await import("@nirman/services");
    (quickCreateMaterial as any).mockRejectedValue(new Error("Material already exists"));
    const res = await POST(
      makeRequest("/api/materials/quick-create", {
        method: "POST",
        body: { name: "Steel TMT", categoryId: "cat-1", unit: "KG" },
      }),
      {},
    );
    expect(res.status).toBe(409);
  });
});

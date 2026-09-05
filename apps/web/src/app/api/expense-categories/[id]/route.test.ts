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

import { PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const PROJECT_MANAGER = { role: "PROJECT_MANAGER" as const };

function prismaCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cat-1",
    name: "Travel",
    glAccountCode: "5001",
    description: "Travel expenses",
    isActive: true,
    companyId: "company-1",
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "cat-1" }) };

describe("PATCH /api/expense-categories/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().expenseCategory!.findFirst.mockResolvedValue(prismaCategory());
    mockPrisma().expenseCategory!.update.mockResolvedValue(prismaCategory({ name: "Updated Travel" }));
    mockPrisma().expenseCategory!.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns 200 with ok:true on successful update", async () => {
    const res = await PATCH(
      makeRequest("/api/expense-categories/cat-1", { method: "PATCH", body: { name: "Updated Travel" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("handles isActive toggle directly", async () => {
    const res = await PATCH(
      makeRequest("/api/expense-categories/cat-1", { method: "PATCH", body: { isActive: false } }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().expenseCategory!.updateMany).toHaveBeenCalled();
  });

  it("returns 400 on invalid input (empty name)", async () => {
    const res = await PATCH(
      makeRequest("/api/expense-categories/cat-1", { method: "PATCH", body: { name: "" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks FINANCE_MANAGE", async () => {
    setSessionUser(PROJECT_MANAGER);
    const res = await PATCH(
      makeRequest("/api/expense-categories/cat-1", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when category not found (via service)", async () => {
    mockPrisma().expenseCategory!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/expense-categories/missing", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/expense-categories/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().expenseCategory!.findFirst.mockResolvedValue(prismaCategory());
    mockPrisma().expense!.count.mockResolvedValue(0);
    mockPrisma().expenseCategory!.delete.mockResolvedValue(prismaCategory());
  });

  it("returns 200 with ok:true on successful delete", async () => {
    const res = await DELETE(makeRequest("/api/expense-categories/cat-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when category not found", async () => {
    mockPrisma().expenseCategory!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/expense-categories/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks FINANCE_MANAGE", async () => {
    setSessionUser(PROJECT_MANAGER);
    const res = await DELETE(makeRequest("/api/expense-categories/cat-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});

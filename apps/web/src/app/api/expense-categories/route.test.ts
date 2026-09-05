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
const PROJECT_MANAGER = { role: "PROJECT_MANAGER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

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

describe("GET /api/expense-categories", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().expenseCategory!.findMany.mockResolvedValue([prismaCategory()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/expense-categories"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "cat-1", name: "Travel", glAccountCode: "5001", isActive: true });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/expense-categories"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks FINANCE_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/expense-categories"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/expense-categories", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().expenseCategory!.create.mockResolvedValue(prismaCategory());
  });

  it("returns 400 on invalid input (missing required name)", async () => {
    const res = await POST(
      makeRequest("/api/expense-categories", { method: "POST", body: { glAccountCode: "5001" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid input (missing required glAccountCode)", async () => {
    const res = await POST(
      makeRequest("/api/expense-categories", { method: "POST", body: { name: "Travel" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks FINANCE_MANAGE", async () => {
    setSessionUser(PROJECT_MANAGER);
    const res = await POST(
      makeRequest("/api/expense-categories", { method: "POST", body: { name: "Travel", glAccountCode: "5001" } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("creates a category and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/expense-categories", { method: "POST", body: { name: "Travel", glAccountCode: "5001" } }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("cat-1");
  });
});

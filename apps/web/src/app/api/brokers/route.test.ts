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
const ACCOUNTANT = { role: "ACCOUNTANT" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

function prismaBroker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "brk-1",
    name: "John Doe",
    phone: "9876543210",
    agency: "Doe Realty",
    defaultCommissionPercent: 2.5,
    notes: "Top broker",
    companyId: "company-1",
    deletedAt: null,
    ...overrides,
  };
}

describe("GET /api/brokers", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().broker!.findMany.mockResolvedValue([prismaBroker()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/brokers"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "brk-1", name: "John Doe", agency: "Doe Realty" });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/brokers"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user's role lacks SALES_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/brokers"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/brokers", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().broker!.create.mockResolvedValue(prismaBroker());
  });

  it("returns 400 on invalid input (missing required name)", async () => {
    const res = await POST(makeRequest("/api/brokers", { method: "POST", body: { phone: "123" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks SALE_CREATE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(makeRequest("/api/brokers", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/brokers", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(401);
  });

  it("creates a broker and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/brokers", { method: "POST", body: { name: "John Doe", phone: "9876543210" } }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string; name: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("brk-1");
  });
});

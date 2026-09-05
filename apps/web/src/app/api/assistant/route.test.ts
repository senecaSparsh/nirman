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
    lowStockAlerts: vi.fn().mockResolvedValue([]),
    getCompanyPortfolioSummary: vi.fn().mockResolvedValue({}),
    trialBalance: vi.fn().mockResolvedValue([]),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

describe("POST /api/assistant", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 400 when text is empty", async () => {
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text: "" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is missing", async () => {
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: {} }), {});
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text: "hello" } }), {});
    expect(res.status).toBe(401);
  });

  it("returns a response for a greeting intent", async () => {
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text: "hi" } }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ text: string; intent: string }>(res);
    expect(body.text).toBeTruthy();
    expect(body.intent).toBeTruthy();
  });

  it("returns a response for a help intent", async () => {
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text: "help" } }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ text: string; intent: string }>(res);
    expect(body.text).toBeTruthy();
  });

  it("returns a response for an unknown intent", async () => {
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text: "xyz random gibberish" } }), {});
    expect(res.status).toBe(200);
  });

  it("returns a permission-denied message for a role lacking the required permission", async () => {
    setSessionUser(STORE_KEEPER);
    // "cash position" parses to CASH_POSITION intent which requires FINANCE_VIEW
    // (STORE_KEEPER doesn't have FINANCE_VIEW)
    const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text: "cash position" } }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ text: string }>(res);
    expect(body.text).toMatch(/allowed nahi hai|permission/i);
  });
});

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
    computeSchedule: vi.fn().mockResolvedValue({ tasks: [], startDate: "2024-01-01", endDate: "2024-12-31" }),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

describe("GET /api/schedule", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
  });

  it("returns 200 with schedule data", async () => {
    const res = await GET(makeRequest("/api/schedule?projectId=proj-1"), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ tasks: unknown[] }>(res);
    expect(body.tasks).toEqual([]);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await GET(makeRequest("/api/schedule"), {});
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/schedule?projectId=proj-1"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks PROJECT_CONTROL_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeRequest("/api/schedule?projectId=proj-1"), {});
    expect(res.status).toBe(403);
  });
});

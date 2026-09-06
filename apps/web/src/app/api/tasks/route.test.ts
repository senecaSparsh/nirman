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

function prismaTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    title: "Fix bug",
    description: "Fix the login bug",
    instructions: null,
    status: "PENDING",
    priority: "medium",
    dueDate: new Date("2024-12-31"),
    completedAt: null,
    createdAt: new Date("2024-01-01"),
    assignedToId: "user-owner-1",
    assignedTo: { id: "user-owner-1", name: "Test Owner", email: "owner@test.com", role: "OWNER" },
    assignedBy: { id: "user-owner-1", name: "Test Owner" },
    ...overrides,
  };
}

describe("GET /api/tasks", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.findMany.mockResolvedValue([prismaTask()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/tasks"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "task-1", title: "Fix bug", status: "PENDING" });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/tasks"), {});
    expect(res.status).toBe(401);
  });

  it("filters tasks to own tasks for non-managers", async () => {
    setSessionUser(ACCOUNTANT);
    mockPrisma().task!.findMany.mockResolvedValue([prismaTask({ assignedToId: "user-owner-1" })]);
    const res = await GET(makeRequest("/api/tasks"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/tasks", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.create.mockResolvedValue({ id: "task-1" });
    mockPrisma().user!.findUnique.mockResolvedValue({ id: "user-owner-1", active: true, name: "Test Owner" });
  });

  it("returns 400 on invalid input (missing required title)", async () => {
    const res = await POST(makeRequest("/api/tasks", { method: "POST", body: { assignedToId: "user-1" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid input (missing assignedToId)", async () => {
    const res = await POST(makeRequest("/api/tasks", { method: "POST", body: { title: "X" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 when assignee not found", async () => {
    // getCurrentUser is memoized per-request via AsyncLocalStorage, so the
    // auth chain calls user.findUnique only once (not 3x as before). The
    // 2nd call = assignee check.
    const authUser = { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
    mockPrisma().user!.findUnique
      .mockResolvedValueOnce(authUser)
      .mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest("/api/tasks", { method: "POST", body: { title: "X", assignedToId: "ghost" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when assignee is inactive", async () => {
    const authUser = { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
    mockPrisma().user!.findUnique
      .mockResolvedValueOnce(authUser)
      .mockResolvedValueOnce({ id: "u1", active: false, name: "Inactive" });
    const res = await POST(
      makeRequest("/api/tasks", { method: "POST", body: { title: "X", assignedToId: "u1" } }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks TASKS_ASSIGN", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/tasks", { method: "POST", body: { title: "X", assignedToId: "u1" } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("creates a task and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/tasks", { method: "POST", body: { title: "Fix bug", assignedToId: "user-owner-1" } }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("task-1");
  });
});

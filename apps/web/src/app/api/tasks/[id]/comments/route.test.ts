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
    addComment: vi.fn().mockResolvedValue({ id: "comment-1" }),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const SUPERVISOR = { role: "SUPERVISOR" as const };

describe("POST /api/tasks/[id]/comments", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().task!.findUnique.mockResolvedValue({ assignedToId: "user-owner-1" });
  });

  it("returns 201 on successful comment creation", async () => {
    const res = await POST(
      makeRequest("/api/tasks/task-1/comments", { method: "POST", body: { body: "Nice work" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ ok: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 on empty comment", async () => {
    const res = await POST(
      makeRequest("/api/tasks/task-1/comments", { method: "POST", body: { body: "" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when task not found", async () => {
    mockPrisma().task!.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/tasks/task-99/comments", { method: "POST", body: { body: "Test" } }),
      { params: Promise.resolve({ id: "task-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not assignee and not a manager", async () => {
    setSessionUser(SUPERVISOR);
    mockPrisma().task!.findUnique.mockResolvedValue({ assignedToId: "other-user" });
    const res = await POST(
      makeRequest("/api/tasks/task-1/comments", { method: "POST", body: { body: "Test" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/tasks/task-1/comments", { method: "POST", body: { body: "Test" } }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(401);
  });
});

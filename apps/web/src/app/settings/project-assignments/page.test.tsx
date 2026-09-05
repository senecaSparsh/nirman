// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@/test/render";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

vi.mock("@nirman/services", () => ({
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/settings/project-assignments-view", () => ({
  ProjectAssignmentsView: (props: { assignments: unknown[]; permissions: { canManage: boolean } }) => (
    <div data-testid="project-assignments-view">
      <span data-testid="assignments-count">{props.assignments.length}</span>
      <span data-testid="can-manage">{String(props.permissions?.canManage ?? false)}</span>
    </div>
  ),
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string }) => (
    <div data-testid="page-header"><h1>{props.title}</h1></div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { ProjectAssignmentsContent } from "./page";

describe("ProjectAssignmentsPage (ProjectAssignmentsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the ProjectAssignmentsView with fetched assignments", async () => {
    mockPrisma().projectAssignment!.findMany.mockResolvedValue([
      {
        id: "a1", userId: "u1", projectId: "p1", scopedRole: "SUPERVISOR",
        assignedAt: new Date("2024-06-01"),
        user: { id: "u1", name: "Alice", email: "alice@test.com", role: "SUPERVISOR" },
        project: { id: "p1", name: "Tower A" },
      },
    ]);

    const ui = await ProjectAssignmentsContent();
    render(ui);
    expect(screen.getByTestId("project-assignments-view")).toBeInTheDocument();
    expect(screen.getByTestId("assignments-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without USERS_VIEW", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await ProjectAssignmentsContent();
    render(ui);
    expect(screen.queryByTestId("project-assignments-view")).not.toBeInTheDocument();
  });

  it("passes canManage=true for OWNER role", async () => {
    const ui = await ProjectAssignmentsContent();
    render(ui);
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");
  });

  it("passes canManage=false for SITE_ENGINEER role", async () => {
    // SITE_ENGINEER lacks USERS_VIEW so it shows NoAccess; use HR_MANAGER which has USERS_VIEW but not USERS_MANAGE
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await ProjectAssignmentsContent();
    render(ui);
    expect(screen.getByTestId("can-manage")).toHaveTextContent("false");
  });
});

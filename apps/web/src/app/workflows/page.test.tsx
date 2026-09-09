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

vi.mock("@/components/workflows/workflows-list", () => ({
  WorkflowsList: (props: { workflows: unknown[] }) => (
    <div data-testid="workflows-list">
      <span data-testid="workflows-count">{props.workflows.length}</span>
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

vi.mock("@/components/no-access", () => ({
  NoAccess: () => <div data-testid="no-access">No Access</div>,
}));

import { WorkflowsContent } from "./content";

describe("WorkflowsPage (WorkflowsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().workflow!.findMany.mockResolvedValue([]);
  });

  it("renders the WorkflowsList with fetched workflows", async () => {
    mockPrisma().workflow!.findMany.mockResolvedValue([
      {
        id: "w1", name: "Daily Backup", description: "Backup workflow", icon: "Database",
        status: "ACTIVE", createdAt: new Date("2024-06-01"),
        _count: { runs: 5 },
        schedules: [{ nextRunAt: new Date("2024-06-02"), intervalM: 1440, cron: "0 2 * * *" }],
      },
    ]);

    const ui = await WorkflowsContent();
    render(ui);
    expect(screen.getByTestId("workflows-list")).toBeInTheDocument();
    expect(screen.getByTestId("workflows-count")).toHaveTextContent("1");
  });

  it("renders empty list when no workflows", async () => {
    const ui = await WorkflowsContent();
    render(ui);
    expect(screen.getByTestId("workflows-count")).toHaveTextContent("0");
  });

  it("shows NoAccess for a role without CANVAS_VIEW", async () => {
    setSessionUser({ role: "ACCOUNTANT" });
    const ui = await WorkflowsContent();
    render(ui);
    expect(screen.getByTestId("no-access")).toBeInTheDocument();
    expect(screen.queryByTestId("workflows-list")).not.toBeInTheDocument();
  });
});

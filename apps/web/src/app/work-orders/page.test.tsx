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

vi.mock("@/components/work-orders/work-orders-view", () => ({
  WorkOrdersView: (props: { projects: unknown[]; canCreate: boolean; permissions: Record<string, boolean> }) => (
    <div data-testid="wo-view">
      <span data-testid="projects-count">{props.projects.length}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
      <span data-testid="can-manage">{String(props.permissions?.canManage ?? false)}</span>
      <span data-testid="can-approve">{String(props.permissions?.canApprove ?? false)}</span>
    </div>
  ),
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string; stats: Array<{ label: string; value: unknown }> }) => (
    <div data-testid="page-header">
      <h1>{props.title}</h1>
      {props.stats.map((s) => (
        <div key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
          {s.label}: {String(s.value)}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { WoContent } from "./content";

describe("WorkOrdersPage (WoContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Work Orders title", async () => {
    const ui = await WoContent();
    render(ui);
    expect(screen.getByText("Work Orders")).toBeInTheDocument();
  });

  it("renders the WorkOrdersView with fetched projects", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "Tower A", type: "RESIDENTIAL", status: "ACTIVE" },
    ]);

    const ui = await WoContent();
    render(ui);

    expect(screen.getByTestId("wo-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("1");
  });

  it("passes canCreate=true and canManage=true for OWNER role", async () => {
    const ui = await WoContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");
    expect(screen.getByTestId("can-approve")).toHaveTextContent("true");
  });

  it("passes canCreate=false for SITE_ENGINEER role (lacks ASSETS_MANAGE)", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await WoContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("false");
    expect(screen.getByTestId("can-manage")).toHaveTextContent("false");
  });

  it("shows NoAccess for a role without ASSETS_VIEW", async () => {
    // HR_MANAGER lacks ASSETS_VIEW
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await WoContent();
    render(ui);
    expect(screen.queryByTestId("wo-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("shows project count in stats", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "A", type: "R", status: "ACTIVE" },
      { id: "p2", name: "B", type: "C", status: "PLANNED" },
    ]);

    const ui = await WoContent();
    render(ui);
    expect(screen.getByTestId("stat-projects")).toHaveTextContent("2");
  });
});

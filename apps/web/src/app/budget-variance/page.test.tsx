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

vi.mock("@/components/budget-variance/budget-variance-view", () => ({
  BudgetVarianceView: (props: { projects: unknown[] }) => (
    <div data-testid="bv-view">
      <span data-testid="projects-count">{props.projects.length}</span>
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

import { BvContent } from "./page";

describe("BudgetVariancePage (BvContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Budget Variance title", async () => {
    const ui = await BvContent();
    render(ui);
    expect(screen.getByText("Budget Variance")).toBeInTheDocument();
  });

  it("renders the BudgetVarianceView with fetched projects", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "Tower A" },
      { id: "p2", name: "Tower B" },
    ]);

    const ui = await BvContent();
    render(ui);

    expect(screen.getByTestId("bv-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("2");
  });

  it("shows project count in stats", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "A" },
    ]);

    const ui = await BvContent();
    render(ui);
    expect(screen.getByTestId("stat-projects")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without FINANCE_VIEW", async () => {
    // SITE_ENGINEER lacks FINANCE_VIEW
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await BvContent();
    render(ui);
    expect(screen.queryByTestId("bv-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("renders empty state when no projects exist", async () => {
    const ui = await BvContent();
    render(ui);
    expect(screen.getByTestId("projects-count")).toHaveTextContent("0");
  });
});

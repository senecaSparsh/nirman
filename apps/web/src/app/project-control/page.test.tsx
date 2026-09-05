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

vi.mock("@/components/project-control/project-control-view", () => ({
  ProjectControlView: (props: { projects: unknown[] }) => (
    <div data-testid="pc-view">
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

import { ProjectControlContent } from "./page";

describe("ProjectControlPage (ProjectControlContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Project Control title", async () => {
    const ui = await ProjectControlContent();
    render(ui);
    expect(screen.getByText("Project Control")).toBeInTheDocument();
  });

  it("renders the ProjectControlView with fetched projects", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "Tower A" },
    ]);

    const ui = await ProjectControlContent();
    render(ui);

    expect(screen.getByTestId("pc-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("1");
  });

  it("shows project count in stats", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ]);

    const ui = await ProjectControlContent();
    render(ui);
    expect(screen.getByTestId("stat-projects")).toHaveTextContent("2");
  });

  it("shows NoAccess for a role without PROJECT_CONTROL_VIEW", async () => {
    // SALES_MANAGER lacks PROJECT_CONTROL_VIEW
    setSessionUser({ role: "SALES_MANAGER" });
    const ui = await ProjectControlContent();
    render(ui);
    expect(screen.queryByTestId("pc-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("renders empty state when no projects exist", async () => {
    const ui = await ProjectControlContent();
    render(ui);
    expect(screen.getByTestId("projects-count")).toHaveTextContent("0");
  });
});

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

vi.mock("@/components/boq/boq-project-view", () => ({
  BoqProjectView: (props: { projects: unknown[]; materials: unknown[]; canEdit: boolean }) => (
    <div data-testid="boq-view">
      <span data-testid="projects-count">{props.projects.length}</span>
      <span data-testid="materials-count">{props.materials.length}</span>
      <span data-testid="can-edit">{String(props.canEdit)}</span>
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

import { BoqContent } from "./page";

describe("BoqPage (BoqContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().project!.findMany.mockResolvedValue([]);
    mockPrisma().material!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Bill of Quantities title", async () => {
    const ui = await BoqContent();
    render(ui);
    expect(screen.getByText("Bill of Quantities")).toBeInTheDocument();
  });

  it("renders the BoqProjectView with fetched projects and materials", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "Tower A", type: "RESIDENTIAL", status: "ACTIVE" },
    ]);
    mockPrisma().material!.findMany.mockResolvedValue([
      { id: "m1", code: "STL-001", name: "Steel", unit: "KG" },
    ]);

    const ui = await BoqContent();
    render(ui);

    expect(screen.getByTestId("boq-view")).toBeInTheDocument();
    expect(screen.getByTestId("projects-count")).toHaveTextContent("1");
    expect(screen.getByTestId("materials-count")).toHaveTextContent("1");
  });

  it("passes canEdit=true for OWNER role", async () => {
    const ui = await BoqContent();
    render(ui);
    expect(screen.getByTestId("can-edit")).toHaveTextContent("true");
  });

  it("passes canEdit=false for SITE_ENGINEER role (lacks BOQ_MANAGE)", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await BoqContent();
    render(ui);
    expect(screen.getByTestId("can-edit")).toHaveTextContent("false");
  });

  it("shows NoAccess for a role without BOQ_VIEW", async () => {
    // SALES_MANAGER lacks BOQ_VIEW
    setSessionUser({ role: "SALES_MANAGER" });
    const ui = await BoqContent();
    render(ui);
    expect(screen.queryByTestId("boq-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("shows project and material counts in stats", async () => {
    mockPrisma().project!.findMany.mockResolvedValue([
      { id: "p1", name: "A", type: "RESIDENTIAL", status: "ACTIVE" },
      { id: "p2", name: "B", type: "COMMERCIAL", status: "PLANNED" },
    ]);
    mockPrisma().material!.findMany.mockResolvedValue([
      { id: "m1", code: "C1", name: "Cement", unit: "BAG" },
    ]);

    const ui = await BoqContent();
    render(ui);
    expect(screen.getByTestId("stat-projects")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-materials")).toHaveTextContent("1");
  });
});

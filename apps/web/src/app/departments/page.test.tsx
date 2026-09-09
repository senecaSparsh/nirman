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

vi.mock("@/components/departments/departments-view", () => ({
  DepartmentsView: (props: { departments: unknown[]; canCreate: boolean; canEdit: boolean }) => (
    <div data-testid="departments-view">
      <span data-testid="departments-count">{props.departments.length}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
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

import { DepartmentsContent } from "./content";

describe("DepartmentsPage (DepartmentsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Departments title", async () => {
    const ui = await DepartmentsContent();
    render(ui);
    expect(screen.getByText("Departments")).toBeInTheDocument();
  });

  it("renders the DepartmentsView with fetched departments", async () => {
    mockPrisma().department!.findMany.mockResolvedValue([
      {
        id: "d1", code: "MFG", name: "Manufacturing", description: "Main line",
        active: true, stockLocation: { id: "sl1", name: "MFG Store" },
        _count: { materialIssues: 5 },
      },
    ]);

    const ui = await DepartmentsContent();
    render(ui);
    expect(screen.getByTestId("departments-view")).toBeInTheDocument();
    expect(screen.getByTestId("departments-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without INVENTORY_VIEW", async () => {
    setSessionUser({ role: "ACCOUNTANT" });
    const ui = await DepartmentsContent();
    render(ui);
    expect(screen.queryByTestId("departments-view")).not.toBeInTheDocument();
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await DepartmentsContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });

  it("shows active and with-stock-room stats", async () => {
    const ui = await DepartmentsContent();
    render(ui);
    expect(screen.getByTestId("stat-active")).toBeInTheDocument();
    expect(screen.getByTestId("stat-with-stock-room")).toBeInTheDocument();
  });
});

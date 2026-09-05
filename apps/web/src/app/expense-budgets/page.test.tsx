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
  getExpenseBudgetVariance: vi.fn(async () => []),
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/expenses/expense-budgets-view", () => ({
  ExpenseBudgetsView: (props: { budgets: unknown[]; permissions: { canManage: boolean } }) => (
    <div data-testid="expense-budgets-view">
      <span data-testid="budgets-count">{props.budgets.length}</span>
      <span data-testid="can-manage">{String(props.permissions?.canManage ?? false)}</span>
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

import { BudgetsContent } from "./page";

describe("ExpenseBudgetsPage (BudgetsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Expense Budgets title", async () => {
    const ui = await BudgetsContent();
    render(ui);
    expect(screen.getByText("Expense Budgets")).toBeInTheDocument();
  });

  it("renders the ExpenseBudgetsView with fetched budgets", async () => {
    mockPrisma().expenseBudget!.findMany.mockResolvedValue([
      {
        id: "b1", category: "TRAVEL", categoryMaster: { id: "c1", name: "Travel" },
        amount: 50000, periodStart: new Date("2024-01-01"), periodEnd: new Date("2024-12-31"),
        projectId: null, project: null, notes: "Annual travel budget",
      },
    ]);

    const ui = await BudgetsContent();
    render(ui);
    expect(screen.getByTestId("expense-budgets-view")).toBeInTheDocument();
    expect(screen.getByTestId("budgets-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without FINANCE_VIEW", async () => {
    setSessionUser({ role: "SUPERVISOR" });
    const ui = await BudgetsContent();
    render(ui);
    expect(screen.queryByTestId("expense-budgets-view")).not.toBeInTheDocument();
  });

  it("passes canManage=true for OWNER role", async () => {
    const ui = await BudgetsContent();
    render(ui);
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");
  });
});

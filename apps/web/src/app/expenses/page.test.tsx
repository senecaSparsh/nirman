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
  seedChartOfAccounts: vi.fn(async () => {}),
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/expenses/expenses-view", () => ({
  ExpensesView: (props: { expenses: unknown[]; permissions: { canCreate: boolean; canApprove: boolean } }) => (
    <div data-testid="expenses-view">
      <span data-testid="expenses-count">{props.expenses.length}</span>
      <span data-testid="can-create">{String(props.permissions?.canCreate ?? false)}</span>
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

import { ExpensesContent } from "./page";

describe("ExpensesPage (ExpensesContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Expenses title", async () => {
    const ui = await ExpensesContent();
    render(ui);
    expect(screen.getByText("Expenses")).toBeInTheDocument();
  });

  it("renders the ExpensesView with fetched expenses", async () => {
    mockPrisma().expense!.findMany.mockResolvedValue([
      {
        id: "e1", projectId: null, project: null, categoryId: null, categoryMaster: null,
        category: "TRAVEL", amount: 5000, subtotal: 5000, cgst: 0, sgst: 0, igst: 0,
        tdsAmount: 0, supplierId: null, supplier: null, payeeName: "Alice",
        paymentMode: "CASH", bankAccount: null, chequeNo: null, chequeDate: null,
        chequePhotoUrl: null, referenceNo: null, receiptUrl: null, status: "APPROVED",
        submittedById: null, submittedBy: null, submittedAt: null,
        approvedById: null, approvedBy: null, approvedAt: null,
        rejectedReason: null, glPostedAt: null, createdBy: null,
        date: new Date("2024-06-01"), notes: "Travel expense",
      },
    ]);

    const ui = await ExpensesContent();
    render(ui);
    expect(screen.getByTestId("expenses-view")).toBeInTheDocument();
    expect(screen.getByTestId("expenses-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without FINANCE_VIEW", async () => {
    setSessionUser({ role: "SUPERVISOR" });
    const ui = await ExpensesContent();
    render(ui);
    expect(screen.queryByTestId("expenses-view")).not.toBeInTheDocument();
  });

  it("passes canApprove=true for OWNER role", async () => {
    const ui = await ExpensesContent();
    render(ui);
    expect(screen.getByTestId("can-approve")).toHaveTextContent("true");
  });

  it("shows categories stat in the page header", async () => {
    const ui = await ExpensesContent();
    render(ui);
    expect(screen.getByTestId("stat-categories")).toBeInTheDocument();
  });
});

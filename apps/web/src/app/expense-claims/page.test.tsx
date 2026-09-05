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

vi.mock("@/components/expenses/expense-claims-view", () => ({
  ExpenseClaimsView: (props: { claims: unknown[]; permissions: { canCreate: boolean; canApprove: boolean } }) => (
    <div data-testid="expense-claims-view">
      <span data-testid="claims-count">{props.claims.length}</span>
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

import { ExpenseClaimsContent } from "./page";

describe("ExpenseClaimsPage (ExpenseClaimsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Expense Claims title", async () => {
    const ui = await ExpenseClaimsContent();
    render(ui);
    expect(screen.getByText("Expense Claims")).toBeInTheDocument();
  });

  it("renders the ExpenseClaimsView with fetched claims", async () => {
    mockPrisma().expenseClaim!.findMany.mockResolvedValue([
      {
        id: "c1", claimantId: "u1", claimant: { id: "u1", name: "Alice" }, projectId: null, project: null,
        status: "SUBMITTED", totalAmount: 5000, description: "Travel",
        submittedAt: new Date("2024-06-01"), approvedAt: null, paidAt: null,
        paymentMode: null, referenceNo: null, lines: [{ id: "l1", amount: 5000 }],
        createdAt: new Date("2024-06-01"),
      },
    ]);

    const ui = await ExpenseClaimsContent();
    render(ui);
    expect(screen.getByTestId("expense-claims-view")).toBeInTheDocument();
    expect(screen.getByTestId("claims-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without FINANCE_VIEW", async () => {
    setSessionUser({ role: "SUPERVISOR" });
    const ui = await ExpenseClaimsContent();
    render(ui);
    expect(screen.queryByTestId("expense-claims-view")).not.toBeInTheDocument();
  });

  it("passes canApprove=true for OWNER role", async () => {
    const ui = await ExpenseClaimsContent();
    render(ui);
    expect(screen.getByTestId("can-approve")).toHaveTextContent("true");
  });

  it("shows pending stat in the page header", async () => {
    mockPrisma().expenseClaim!.findMany.mockResolvedValue([
      {
        id: "c1", claimantId: "u1", claimant: { name: "Alice" }, projectId: null, project: null,
        status: "SUBMITTED", totalAmount: 5000, description: "Travel",
        submittedAt: new Date("2024-06-01"), approvedAt: null, paidAt: null,
        paymentMode: null, referenceNo: null, lines: [],
        createdAt: new Date("2024-06-01"),
      },
    ]);

    const ui = await ExpenseClaimsContent();
    render(ui);
    expect(screen.getByTestId("stat-pending")).toBeInTheDocument();
  });
});

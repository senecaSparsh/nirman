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

vi.mock("@/components/brokers/brokers-view", () => ({
  BrokersView: (props: { brokers: unknown[]; canCreate: boolean; canEdit: boolean; canDelete: boolean }) => (
    <div data-testid="brokers-view">
      <span data-testid="brokers-count">{props.brokers.length}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
      <span data-testid="brokers-json">{JSON.stringify(props.brokers)}</span>
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

// BrokersPage is a direct async default export (no Suspense wrapper / inner component)
import BrokersPage from "./page";

describe("BrokersPage", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().broker!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Brokers title", async () => {
    const ui = await BrokersPage();
    render(ui);
    expect(screen.getByText("Brokers")).toBeInTheDocument();
  });

  it("renders the BrokersView with fetched data", async () => {
    mockPrisma().broker!.findMany.mockResolvedValue([
      {
        id: "b1", name: "Rajesh", phone: "123", agency: "ABC Realty",
        defaultCommissionPercent: 2, notes: null,
        assetSales: [
          { commissionAmount: 50000, commissionPaid: true },
          { commissionAmount: 30000, commissionPaid: false },
        ],
      },
    ]);

    const ui = await BrokersPage();
    render(ui);

    expect(screen.getByTestId("brokers-view")).toBeInTheDocument();
    expect(screen.getByTestId("brokers-count")).toHaveTextContent("1");
  });

  it("computes commission totals from asset sales", async () => {
    mockPrisma().broker!.findMany.mockResolvedValue([
      {
        id: "b1", name: "Rajesh", phone: "123", agency: "ABC",
        defaultCommissionPercent: 2, notes: null,
        assetSales: [
          { commissionAmount: 50000, commissionPaid: true },
          { commissionAmount: 30000, commissionPaid: false },
        ],
      },
    ]);

    const ui = await BrokersPage();
    render(ui);

    const brokers = JSON.parse(screen.getByTestId("brokers-json").textContent!);
    expect(brokers[0].totalCommission).toBe(80000);
    expect(brokers[0].commissionPaid).toBe(50000);
    expect(brokers[0].dealCount).toBe(2);
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await BrokersPage();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });

  it("shows NoAccess for a role without SALES_VIEW", async () => {
    // HR_MANAGER lacks SALES_VIEW
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await BrokersPage();
    render(ui);
    expect(screen.queryByTestId("brokers-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("shows deal and commission stats", async () => {
    mockPrisma().broker!.findMany.mockResolvedValue([
      {
        id: "b1", name: "Rajesh", phone: "123", agency: "ABC",
        defaultCommissionPercent: null, notes: null,
        assetSales: [{ commissionAmount: 50000, commissionPaid: true }],
      },
    ]);

    const ui = await BrokersPage();
    render(ui);
    expect(screen.getByTestId("stat-brokers")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-deals")).toHaveTextContent("1");
  });
});

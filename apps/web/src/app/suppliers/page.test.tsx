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

vi.mock("@/components/vendors/vendors-view", () => ({
  VendorsView: (props: { vendors: unknown[]; permissions: { canManage: boolean } }) => (
    <div data-testid="vendors-view">
      <span data-testid="vendors-count">{props.vendors.length}</span>
      <span data-testid="can-manage">{String(props.permissions?.canManage ?? false)}</span>
      <span data-testid="vendors-json">{JSON.stringify(props.vendors)}</span>
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

import { VendorsContent } from "./page";

describe("SuppliersPage (VendorsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().supplier!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Vendors title", async () => {
    const ui = await VendorsContent();
    render(ui);
    expect(screen.getByText("Vendors")).toBeInTheDocument();
  });

  it("renders the VendorsView with fetched data", async () => {
    mockPrisma().supplier!.findMany.mockResolvedValue([
      {
        id: "s1", name: "Steel Co", gstin: "27ABCDE1234F1Z5", phone: "1234567890",
        email: "sales@steelco.com", address: "Mumbai", balanceOwed: 5000, leadTimeDays: 7,
        purchaseOrders: [
          { id: "po1", poNumber: "PO-001", status: "ORDERED", orderDate: new Date("2024-11-01"), total: 10000, gstTotal: 1800 },
        ],
        _count: { purchaseOrders: 1 },
      },
    ]);

    const ui = await VendorsContent();
    render(ui);

    expect(screen.getByTestId("vendors-view")).toBeInTheDocument();
    expect(screen.getByTestId("vendors-count")).toHaveTextContent("1");
  });

  it("passes canManage=true for OWNER role", async () => {
    const ui = await VendorsContent();
    render(ui);
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");
  });

  it("shows NoAccess for a role without PROCUREMENT_VIEW", async () => {
    // HR_MANAGER lacks PROCUREMENT_VIEW
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await VendorsContent();
    const { container } = render(ui);
    expect(screen.queryByTestId("vendors-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("computes vendor row data — totalSpent, openPOs, totalPOs", async () => {
    mockPrisma().supplier!.findMany.mockResolvedValue([
      {
        id: "s1", name: "Steel Co", gstin: null, phone: null, email: null, address: null,
        balanceOwed: 5000, leadTimeDays: 7,
        purchaseOrders: [
          { id: "po1", poNumber: "PO-001", status: "ORDERED", orderDate: new Date("2024-11-01"), total: 10000, gstTotal: 1800 },
          { id: "po2", poNumber: "PO-002", status: "RECEIVED", orderDate: new Date("2024-11-02"), total: 5000, gstTotal: 900 },
        ],
        _count: { purchaseOrders: 5 },
      },
    ]);

    const ui = await VendorsContent();
    render(ui);

    const vendors = JSON.parse(screen.getByTestId("vendors-json").textContent!);
    expect(vendors[0].totalSpent).toBe(15000); // 10000 + 5000
    expect(vendors[0].openPOs).toBe(1); // only ORDERED is open
    expect(vendors[0].totalPOs).toBe(5); // from _count
    expect(vendors[0].balanceOwed).toBe(5000);
  });

  it("shows With Dues stat when vendors have outstanding balances", async () => {
    mockPrisma().supplier!.findMany.mockResolvedValue([
      {
        id: "s1", name: "Vendor A", gstin: null, phone: null, email: null, address: null,
        balanceOwed: 5000, leadTimeDays: null, purchaseOrders: [], _count: { purchaseOrders: 0 },
      },
    ]);

    const ui = await VendorsContent();
    render(ui);

    expect(screen.getByTestId("stat-with-dues")).toHaveTextContent("1");
  });
});

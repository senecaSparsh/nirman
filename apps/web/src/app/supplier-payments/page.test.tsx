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

vi.mock("@/components/finance/supplier-payments-view", () => ({
  SupplierPaymentsView: (props: { payments: unknown[]; suppliers: unknown[] }) => (
    <div data-testid="supplier-payments-view">
      <span data-testid="payments-count">{props.payments.length}</span>
      <span data-testid="suppliers-count">{props.suppliers.length}</span>
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

import { SupplierPaymentsContent } from "./page";

describe("SupplierPaymentsPage (SupplierPaymentsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Supplier Payments title", async () => {
    const ui = await SupplierPaymentsContent();
    render(ui);
    expect(screen.getByText("Supplier Payments")).toBeInTheDocument();
  });

  it("renders the SupplierPaymentsView with fetched payments", async () => {
    mockPrisma().supplierPayment!.findMany.mockResolvedValue([
      {
        id: "p1", paymentNumber: "PAY-001", supplierId: "s1",
        supplier: { id: "s1", name: "ABC Steel" },
        purchaseOrderId: null, purchaseOrder: null,
        invoiceId: null, invoice: null,
        amount: 50000, tdsAmount: 500, tdsSection: "194C",
        netPaidAmount: 49500, paymentDate: new Date("2024-06-01"),
        paymentMode: "BANK_TRANSFER", referenceNo: "REF001",
        chequePhotoUrl: null, notes: null, createdBy: null,
      },
    ]);

    const ui = await SupplierPaymentsContent();
    render(ui);
    expect(screen.getByTestId("supplier-payments-view")).toBeInTheDocument();
    expect(screen.getByTestId("payments-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without FINANCE_VIEW", async () => {
    setSessionUser({ role: "SUPERVISOR" });
    const ui = await SupplierPaymentsContent();
    render(ui);
    expect(screen.queryByTestId("supplier-payments-view")).not.toBeInTheDocument();
  });

  it("shows total paid and TDS stats in the page header", async () => {
    const ui = await SupplierPaymentsContent();
    render(ui);
    expect(screen.getByTestId("stat-total-paid")).toBeInTheDocument();
    expect(screen.getByTestId("stat-total-tds-deducted")).toBeInTheDocument();
  });
});

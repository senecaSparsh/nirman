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

vi.mock("@/components/sms/sms-view", () => ({
  SmsView: (props: { items: unknown[]; canCreate: boolean }) => (
    <div data-testid="sms-view">
      <span data-testid="sms-count">{props.items.length}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
      <span data-testid="sms-json">{JSON.stringify(props.items)}</span>
    </div>
  ),
}));

vi.mock("@/components/refresh-button", () => ({
  RefreshButton: () => <div data-testid="refresh-button">Refresh</div>,
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

import { SmsContent } from "./page";

describe("SmsPage (SmsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().bankSms!.findMany.mockResolvedValue([]);
    mockPrisma().bankSms!.groupBy.mockResolvedValue([]);
  });

  it("renders the page header with Bank SMS title", async () => {
    const ui = await SmsContent();
    render(ui);
    expect(screen.getByText("Bank SMS")).toBeInTheDocument();
  });

  it("renders the SmsView with fetched SMS records", async () => {
    const receivedAt = new Date("2024-12-01T10:00:00Z");
    mockPrisma().bankSms!.findMany.mockResolvedValue([
      {
        id: "s1", sender: "SBI", message: "Payment received", receivedAt,
        amount: 5000, upiRef: "12345", bankName: "SBI", txnType: "CREDIT",
        counterparty: "John", status: "MATCHED", matchedEntityType: "SALE",
        matchedEntityId: "sale-1", paymentRecordId: "pay-1",
        matchConfidence: 0.95, matchReason: "Amount match",
      },
    ]);

    const ui = await SmsContent();
    render(ui);

    expect(screen.getByTestId("sms-view")).toBeInTheDocument();
    expect(screen.getByTestId("sms-count")).toHaveTextContent("1");

    const items = JSON.parse(screen.getByTestId("sms-json").textContent!);
    expect(items[0].id).toBe("s1");
    expect(items[0].receivedAt).toBe(receivedAt.toISOString());
    expect(items[0].amount).toBe(5000);
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await SmsContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });

  it("shows NoAccess for a role without SALES_VIEW", async () => {
    // HR_MANAGER lacks SALES_VIEW
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await SmsContent();
    render(ui);
    expect(screen.queryByTestId("sms-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("shows matched and unmatched counts from groupBy stats", async () => {
    mockPrisma().bankSms!.groupBy.mockResolvedValue([
      { status: "MATCHED", _count: 5, _sum: { amount: 50000 } },
      { status: "UNMATCHED", _count: 3, _sum: { amount: null } },
    ]);

    const ui = await SmsContent();
    render(ui);
    expect(screen.getByTestId("stat-matched")).toHaveTextContent("5");
    expect(screen.getByTestId("stat-unmatched")).toHaveTextContent("3");
  });

  it("renders the refresh button", async () => {
    const ui = await SmsContent();
    render(ui);
    expect(screen.getByTestId("refresh-button")).toBeInTheDocument();
  });
});

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

vi.mock("@/components/rentals/rentals-view", () => ({
  RentalsView: (props: { tenancies: unknown[]; landParcels: unknown[]; builtUnits: unknown[]; customers: unknown[]; projects: unknown[]; permissions: { canManage: boolean; canTerminate: boolean } }) => (
    <div data-testid="rentals-view">
      <span data-testid="tenancies-count">{props.tenancies.length}</span>
      <span data-testid="can-manage">{String(props.permissions?.canManage ?? false)}</span>
      <span data-testid="can-terminate">{String(props.permissions?.canTerminate ?? false)}</span>
      <span data-testid="tenancies-json">{JSON.stringify(props.tenancies)}</span>
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

import { RentalsContent } from "./page";

describe("RentalsPage (RentalsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().tenancy!.findMany.mockResolvedValue([]);
    mockPrisma().landParcel!.findMany.mockResolvedValue([]);
    mockPrisma().builtUnit!.findMany.mockResolvedValue([]);
    mockPrisma().customer!.findMany.mockResolvedValue([]);
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Rentals title", async () => {
    const ui = await RentalsContent();
    render(ui);
    expect(screen.getByText("Rentals")).toBeInTheDocument();
  });

  it("renders the RentalsView with fetched tenancies", async () => {
    mockPrisma().tenancy!.findMany.mockResolvedValue([
      {
        id: "t1", assetType: "BUILT_UNIT", landParcelId: null, builtUnitId: "u1",
        customerId: "c1", customer: { id: "c1", name: "John", phone: "123" },
        projectId: "p1", project: { id: "p1", name: "Tower A" },
        tenantName: "John", tenantPhone: "123", tenantEmail: null,
        startDate: new Date("2024-01-01"), endDate: new Date("2025-01-01"),
        monthlyRent: 15000, baseRent: 15000, securityDeposit: 30000,
        rentAgreementNo: null, rentAgreementDocumentUrl: null, rentAgreementDocumentName: null,
        sacCode: null, escalationPercent: null, escalationIntervalMonths: null,
        nextEscalationDate: null, lastEscalatedAt: null, rentFreeDays: null,
        draftDocumentUrl: null, draftDocumentName: null, draftNotes: null, draftDate: null,
        status: "ACTIVE", notes: null, payments: [],
      },
    ]);

    const ui = await RentalsContent();
    render(ui);

    expect(screen.getByTestId("rentals-view")).toBeInTheDocument();
    expect(screen.getByTestId("tenancies-count")).toHaveTextContent("1");
  });

  it("computes totalReceived from payments", async () => {
    mockPrisma().tenancy!.findMany.mockResolvedValue([
      {
        id: "t1", assetType: "BUILT_UNIT", landParcelId: null, builtUnitId: "u1",
        customerId: "c1", customer: { id: "c1", name: "John", phone: "123" },
        projectId: null, project: null, tenantName: "John", tenantPhone: "123", tenantEmail: null,
        startDate: new Date("2024-01-01"), endDate: new Date("2025-01-01"),
        monthlyRent: 15000, baseRent: 15000, securityDeposit: 30000,
        rentAgreementNo: null, rentAgreementDocumentUrl: null, rentAgreementDocumentName: null,
        sacCode: null, escalationPercent: null, escalationIntervalMonths: null,
        nextEscalationDate: null, lastEscalatedAt: null, rentFreeDays: null,
        draftDocumentUrl: null, draftDocumentName: null, draftNotes: null, draftDate: null,
        status: "ACTIVE", notes: null,
        payments: [
          { id: "p1", amount: 15000, tdsAmount: 0, tdsCertificateNo: null, netReceived: 15000, paymentDate: new Date("2024-01-05"), dueDate: new Date("2024-01-05"), mode: "BANK_TRANSFER", reference: "ref1", status: "RECEIVED", periodStart: null, periodEnd: null },
        ],
      },
    ]);

    const ui = await RentalsContent();
    render(ui);

    const tenancies = JSON.parse(screen.getByTestId("tenancies-json").textContent!);
    expect(tenancies[0].totalReceived).toBe(15000);
    expect(tenancies[0].paymentCount).toBe(1);
  });

  it("passes canManage=true for OWNER role", async () => {
    const ui = await RentalsContent();
    render(ui);
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");
    expect(screen.getByTestId("can-terminate")).toHaveTextContent("true");
  });

  it("shows NoAccess for a role without SALES_VIEW", async () => {
    // HR_MANAGER lacks SALES_VIEW
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await RentalsContent();
    render(ui);
    expect(screen.queryByTestId("rentals-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });

  it("shows active tenancy count in stats", async () => {
    mockPrisma().tenancy!.findMany.mockResolvedValue([
      { id: "t1", assetType: "BUILT_UNIT", landParcelId: null, builtUnitId: "u1", customerId: "c1", customer: { id: "c1", name: "J", phone: "1" }, projectId: null, project: null, tenantName: "J", tenantPhone: "1", tenantEmail: null, startDate: new Date("2024-01-01"), endDate: new Date("2025-01-01"), monthlyRent: 15000, baseRent: 15000, securityDeposit: 30000, rentAgreementNo: null, rentAgreementDocumentUrl: null, rentAgreementDocumentName: null, sacCode: null, escalationPercent: null, escalationIntervalMonths: null, nextEscalationDate: null, lastEscalatedAt: null, rentFreeDays: null, draftDocumentUrl: null, draftDocumentName: null, draftNotes: null, draftDate: null, status: "ACTIVE", notes: null, payments: [] },
      { id: "t2", assetType: "BUILT_UNIT", landParcelId: null, builtUnitId: "u2", customerId: "c2", customer: { id: "c2", name: "K", phone: "2" }, projectId: null, project: null, tenantName: "K", tenantPhone: "2", tenantEmail: null, startDate: new Date("2024-01-01"), endDate: new Date("2025-01-01"), monthlyRent: 20000, baseRent: 20000, securityDeposit: 40000, rentAgreementNo: null, rentAgreementDocumentUrl: null, rentAgreementDocumentName: null, sacCode: null, escalationPercent: null, escalationIntervalMonths: null, nextEscalationDate: null, lastEscalatedAt: null, rentFreeDays: null, draftDocumentUrl: null, draftDocumentName: null, draftNotes: null, draftDate: null, status: "ENDED", notes: null, payments: [] },
    ]);

    const ui = await RentalsContent();
    render(ui);
    expect(screen.getByTestId("stat-tenancies")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-active")).toHaveTextContent("1");
  });
});

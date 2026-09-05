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

vi.mock("@/components/requisitions/requisitions-view", () => ({
  RequisitionsView: (props: { requisitions: unknown[]; permissions: { canCreate: boolean; canApprove: boolean } }) => (
    <div data-testid="requisitions-view">
      <span data-testid="req-count">{props.requisitions.length}</span>
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

import { RequisitionsContent } from "./page";

describe("RequisitionsPage (RequisitionsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Material Indents title", async () => {
    const ui = await RequisitionsContent();
    render(ui);
    expect(screen.getByText("Material Indents")).toBeInTheDocument();
  });

  it("renders the RequisitionsView with fetched requisitions", async () => {
    mockPrisma().materialRequisition!.findMany.mockResolvedValue([
      {
        id: "r1", reqNumber: "REQ-001", projectId: "p1", phaseId: null,
        project: { name: "Tower A" }, phase: null,
        status: "SUBMITTED", requestDate: new Date("2024-06-01"),
        neededByDate: null, notes: null, convertedPoId: null,
        lines: [{ qtyRequested: 100, material: { code: "M1", name: "Cement", unit: "BAG" } }],
        vendorQuotes: [], minQuotesRequired: 3, quotesWaived: false, lciDecision: null,
      },
    ]);

    const ui = await RequisitionsContent();
    render(ui);
    expect(screen.getByTestId("requisitions-view")).toBeInTheDocument();
    expect(screen.getByTestId("req-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without PROCUREMENT_VIEW", async () => {
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await RequisitionsContent();
    render(ui);
    expect(screen.queryByTestId("requisitions-view")).not.toBeInTheDocument();
  });

  it("passes canApprove=true for OWNER role", async () => {
    const ui = await RequisitionsContent();
    render(ui);
    expect(screen.getByTestId("can-approve")).toHaveTextContent("true");
  });

  it("shows draft and pending stats", async () => {
    mockPrisma().materialRequisition!.findMany.mockResolvedValue([
      {
        id: "r1", reqNumber: "REQ-001", projectId: "p1", phaseId: null,
        project: { name: "Tower A" }, phase: null,
        status: "DRAFT", requestDate: new Date("2024-06-01"),
        neededByDate: null, notes: null, convertedPoId: null,
        lines: [], vendorQuotes: [], minQuotesRequired: 3, quotesWaived: false, lciDecision: null,
      },
      {
        id: "r2", reqNumber: "REQ-002", projectId: "p1", phaseId: null,
        project: { name: "Tower A" }, phase: null,
        status: "SUBMITTED", requestDate: new Date("2024-06-02"),
        neededByDate: null, notes: null, convertedPoId: null,
        lines: [], vendorQuotes: [], minQuotesRequired: 3, quotesWaived: false, lciDecision: null,
      },
    ]);

    const ui = await RequisitionsContent();
    render(ui);
    expect(screen.getByTestId("stat-drafts")).toHaveTextContent("Drafts: 1");
    expect(screen.getByTestId("stat-pending")).toHaveTextContent("Pending: 1");
  });
});

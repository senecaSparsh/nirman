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

vi.mock("@/components/subcontractors/subcontractors-view", () => ({
  SubcontractorsView: (props: { subcontractors: unknown[]; canCreate: boolean; canEdit: boolean }) => (
    <div data-testid="subcontractors-view">
      <span data-testid="subcontractors-count">{props.subcontractors.length}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
      <span data-testid="can-edit">{String(props.canEdit)}</span>
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

vi.mock("@/components/no-access", () => ({
  NoAccess: () => <div data-testid="no-access">No Access</div>,
}));

import SubcontractorsPage from "./page";

describe("SubcontractorsPage", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the page header with Subcontractors title", async () => {
    const ui = await SubcontractorsPage();
    render(ui);
    expect(screen.getByText("Subcontractors")).toBeInTheDocument();
  });

  it("renders the SubcontractorsView with fetched data", async () => {
    mockPrisma().subcontractor!.findMany.mockResolvedValue([
      {
        id: "sc1", name: "ABC Construction", gstin: "27ABC1234F1Z5",
        phone: "9876543210", email: "abc@con.com", address: "Pune", trade: "CIVIL",
        workOrders: [
          { id: "w1", status: "ACTIVE", totalWorkDone: 100000, totalPaid: 50000, retentionBalance: 5000 },
        ],
      },
    ]);

    const ui = await SubcontractorsPage();
    render(ui);
    expect(screen.getByTestId("subcontractors-view")).toBeInTheDocument();
    expect(screen.getByTestId("subcontractors-count")).toHaveTextContent("1");
  });

  it("shows NoAccess for a role without PROCUREMENT_VIEW", async () => {
    setSessionUser({ role: "HR_MANAGER" });
    const ui = await SubcontractorsPage();
    render(ui);
    expect(screen.getByTestId("no-access")).toBeInTheDocument();
    expect(screen.queryByTestId("subcontractors-view")).not.toBeInTheDocument();
  });

  it("passes canCreate=true for OWNER role", async () => {
    const ui = await SubcontractorsPage();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });
});

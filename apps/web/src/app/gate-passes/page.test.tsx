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

vi.mock("@/components/gate-pass/gate-passes-view", () => ({
  GatePassesView: (props: { gatePasses: unknown[]; locations: unknown[]; materials: unknown[]; projects: unknown[]; permissions: { canCreate: boolean; canApprove: boolean; canExit: boolean; canManage: boolean } }) => (
    <div data-testid="gp-view">
      <span data-testid="gp-count">{props.gatePasses.length}</span>
      <span data-testid="can-create">{String(props.permissions?.canCreate ?? false)}</span>
      <span data-testid="can-approve">{String(props.permissions?.canApprove ?? false)}</span>
      <span data-testid="gp-json">{JSON.stringify(props.gatePasses)}</span>
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

import { GatePassesContent } from "./content";

describe("GatePassesPage (GatePassesContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().gatePass!.findMany.mockResolvedValue([]);
    mockPrisma().stockLocation!.findMany.mockResolvedValue([]);
    mockPrisma().material!.findMany.mockResolvedValue([]);
    mockPrisma().project!.findMany.mockResolvedValue([]);
  });

  it("renders the page header with Gate Passes title", async () => {
    const ui = await GatePassesContent();
    render(ui);
    expect(screen.getByText("Gate Passes")).toBeInTheDocument();
  });

  it("renders the GatePassesView with fetched data", async () => {
    const createdAt = new Date("2024-12-01T10:00:00Z");
    mockPrisma().gatePass!.findMany.mockResolvedValue([
      {
        id: "gp1", gatePassNumber: "GP-001", status: "PENDING", category: "OUTBOUND",
        refType: null, refId: null, locationId: "loc1",
        location: { id: "loc1", name: "Main Gate", type: "WAREHOUSE" },
        projectId: "p1", project: { id: "p1", name: "Tower A" },
        vehicleNumber: "DL01AB1234", vehicleType: "TRUCK", driverName: "Ramesh",
        driverPhone: "123", transporterName: null, destination: "Site A",
        purpose: "Material issue", notes: null, createdAt,
        submittedAt: null, approvedAt: null, exitedAt: null,
        rejectionReason: null, approvalNotes: null,
        createdBy: { id: "u1", name: "Alice" }, submittedBy: null,
        approvedBy: null, rejectedBy: null, exitedBy: null,
        exitNotes: null, exitPhotos: null,
        lines: [
          { id: "l1", materialId: "m1", materialCode: "STL-001", materialName: "Steel", unit: "KG", qty: 500, description: null },
        ],
      },
    ]);

    const ui = await GatePassesContent();
    render(ui);

    expect(screen.getByTestId("gp-view")).toBeInTheDocument();
    expect(screen.getByTestId("gp-count")).toHaveTextContent("1");

    const gps = JSON.parse(screen.getByTestId("gp-json").textContent!);
    expect(gps[0].id).toBe("gp1");
    expect(gps[0].createdAt).toBe(createdAt.toISOString());
    expect(gps[0].lineCount).toBe(1);
    expect(gps[0].lines[0].qty).toBe(500);
    expect(gps[0].locationName).toBe("Main Gate");
  });

  it("passes canCreate=true and canApprove=true for OWNER role", async () => {
    const ui = await GatePassesContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
    expect(screen.getByTestId("can-approve")).toHaveTextContent("true");
  });

  it("passes canCreate=false for STORE_KEEPER role (has GATE_PASS_CREATE but not canApprove for some)", async () => {
    // STORE_KEEPER has GATE_PASS_CREATE and GATE_PASS_EXIT but not GATE_PASS_APPROVE
    setSessionUser({ role: "STORE_KEEPER" });
    const ui = await GatePassesContent();
    render(ui);
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
    expect(screen.getByTestId("can-approve")).toHaveTextContent("false");
  });

  it("shows pending and approved counts in stats", async () => {
    mockPrisma().gatePass!.findMany.mockResolvedValue([
      { id: "gp1", gatePassNumber: "GP-001", status: "PENDING", category: "OUTBOUND", refType: null, refId: null, locationId: "l1", location: { id: "l1", name: "Gate", type: "W" }, projectId: null, project: null, vehicleNumber: null, vehicleType: null, driverName: null, driverPhone: null, transporterName: null, destination: null, purpose: null, notes: null, createdAt: new Date("2024-01-01"), submittedAt: null, approvedAt: null, exitedAt: null, rejectionReason: null, approvalNotes: null, createdBy: null, submittedBy: null, approvedBy: null, rejectedBy: null, exitedBy: null, exitNotes: null, exitPhotos: null, lines: [] },
      { id: "gp2", gatePassNumber: "GP-002", status: "APPROVED", category: "OUTBOUND", refType: null, refId: null, locationId: "l1", location: { id: "l1", name: "Gate", type: "W" }, projectId: null, project: null, vehicleNumber: null, vehicleType: null, driverName: null, driverPhone: null, transporterName: null, destination: null, purpose: null, notes: null, createdAt: new Date("2024-01-01"), submittedAt: null, approvedAt: null, exitedAt: null, rejectionReason: null, approvalNotes: null, createdBy: null, submittedBy: null, approvedBy: null, rejectedBy: null, exitedBy: null, exitNotes: null, exitPhotos: null, lines: [] },
    ]);

    const ui = await GatePassesContent();
    render(ui);
    expect(screen.getByTestId("stat-total")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-pending-approval")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-approved-(awaiting-exit)")).toHaveTextContent("1");
  });
});

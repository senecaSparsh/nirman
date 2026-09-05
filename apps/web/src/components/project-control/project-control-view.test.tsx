// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { ProjectControlView } from "./project-control-view";

const projects = [{ id: "p1", name: "Tower One" }];

const evmData = { pv: 1000000, ev: 900000, ac: 950000, cv: -50000, sv: -100000, cpi: 0.95, spi: 0.9, eac: 1055556, vac: -55556, pctComplete: 45 };
const commitmentsData = { openRequisitions: { count: 3, totalEstimated: 200000 }, openPurchaseOrders: { count: 5, totalCommitted: 500000 }, totalCommitted: 700000 };
const overrunsData = [
  { boqItemId: "b1", serialNo: "1.1", description: "Concrete", materialCode: "CEM-OPC53", materialName: "Cement", unit: "BAG", budgetedQty: 100, budgetedAmount: 50000, actualQty: 110, actualCost: 55000, committedQty: 105, committedCost: 52500, pendingReqQty: 5, projectedQty: 115, projectedCost: 57500, overrun: 7500, overrunPct: 15 },
];
const mtoData = [
  { materialId: "m1", materialCode: "CEM-OPC53", materialName: "Cement", unit: "BAG", boqQty: 100, consumedQty: 50, remainingQty: 50, currentStock: 20, openRequisitionQty: 10, procurementGap: 20 },
];

describe("ProjectControlView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/evm")) return Promise.resolve({ ok: true, json: async () => evmData });
      if (url.includes("/api/project-commitments")) return Promise.resolve({ ok: true, json: async () => commitmentsData });
      if (url.includes("/api/cost-overrun")) return Promise.resolve({ ok: true, json: async () => overrunsData });
      if (url.includes("/api/material-take-off")) return Promise.resolve({ ok: true, json: async () => mtoData });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("renders project selector with project options", () => {
    render(<ProjectControlView projects={projects} />);
    expect(screen.getByText("Tower One")).toBeInTheDocument();
  });

  it("renders project selector before data loads", () => {
    render(<ProjectControlView projects={projects} />);
    // The project selector is always visible (even during loading)
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Tower One")).toBeInTheDocument();
  });

  it("renders EVM metrics after loading", async () => {
    render(<ProjectControlView projects={projects} />);
    await waitFor(() => {
      expect(screen.getByText("Earned Value Management")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("renders overrun items after loading", async () => {
    render(<ProjectControlView projects={projects} />);
    await waitFor(() => {
      expect(screen.getByText("Concrete")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("renders MTO items after loading", async () => {
    render(<ProjectControlView projects={projects} />);
    await waitFor(() => {
      expect(screen.getByText("Cement")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

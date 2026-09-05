// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { DprFinanceReconciliationView } from "./dpr-finance-reconciliation-view";

const reconciliationData = [
  {
    dprId: "d1",
    projectName: "Tower One",
    date: "2024-01-15",
    workSummary: "Foundation work",
    approvalStatus: "APPROVED",
    dprMaterialCost: "50000",
    dprLaborCost: "20000",
    dprTotalCost: "70000",
    postedMaterialIssueCost: "48000",
    postedProjectCost: "20000",
    postedTotal: "68000",
    variance: "2000",
    isPosted: false,
    costPostedDate: null,
  },
];

describe("DprFinanceReconciliationView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => reconciliationData,
    });
  });

  it("renders loading state initially", () => {
    render(<DprFinanceReconciliationView />);
    // The Apply filter button shows "Loading…" while loading is true
    expect(screen.getByRole("button", { name: /Loading/ })).toBeInTheDocument();
  });

  it("renders reconciliation data after loading", async () => {
    render(<DprFinanceReconciliationView />);
    await waitFor(() => {
      expect(screen.getByText("Tower One")).toBeInTheDocument();
    });
  });

  it("renders date filter inputs", () => {
    render(<DprFinanceReconciliationView />);
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
  });

  it("renders table headers after data loads", async () => {
    render(<DprFinanceReconciliationView />);
    await waitFor(() => {
      expect(screen.getByText("Project")).toBeInTheDocument();
      expect(screen.getByText("DPR Cost")).toBeInTheDocument();
    });
  });

  it("renders empty state when no data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    render(<DprFinanceReconciliationView />);
    await waitFor(() => {
      expect(screen.getByText("No DPRs in this date range")).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { BudgetVarianceView } from "./budget-variance-view";

const projects = [{ id: "p1", name: "Tower One" }];

const varianceData = {
  items: [
    { id: "v1", serialNo: "1.1", description: "Concrete", category: "Civil", source: "BOQ" as const, budgetedAmount: 500000, actualAmount: 520000, variance: 20000, variancePct: 4, status: "OVER" as const },
  ],
  totalBudget: 500000,
  totalActual: 520000,
  totalVariance: 20000,
  totalVariancePct: 4,
  boqBudget: 500000,
  nonBoqBudget: 0,
};

describe("BudgetVarianceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => varianceData,
    });
  });

  it("renders project selector with project options", () => {
    render(<BudgetVarianceView projects={projects} />);
    expect(screen.getByText("Tower One")).toBeInTheDocument();
  });

  it("renders loading state after mount", async () => {
    render(<BudgetVarianceView projects={projects} />);
    await waitFor(() => {
      expect(screen.getByText("Loading budget variance…")).toBeInTheDocument();
    });
  });

  it("renders variance items after loading", async () => {
    render(<BudgetVarianceView projects={projects} />);
    await waitFor(() => {
      expect(screen.getAllByText("Concrete").length).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });
  });

  it("renders status badge for over-budget items", async () => {
    render(<BudgetVarianceView projects={projects} />);
    await waitFor(() => {
      expect(screen.getByText("Over")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("renders empty state when no variance data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...varianceData, items: [] }),
    });
    render(<BudgetVarianceView projects={projects} />);
    await waitFor(() => {
      expect(screen.getByText("No data")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

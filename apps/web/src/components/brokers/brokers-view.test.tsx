// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { BrokersView } from "./brokers-view";
import type { BrokerRow } from "@/lib/types";

const brokers: BrokerRow[] = [
  { id: "b1", name: "Raj Broker", phone: "9876543210", agency: "City Realty", defaultCommissionPercent: 2.5, notes: null, dealCount: 5, totalCommission: 125000, commissionPaid: 100000 },
  { id: "b2", name: "Priya Deals", phone: null, agency: null, defaultCommissionPercent: null, notes: null, dealCount: 0, totalCommission: 0, commissionPaid: 0 },
];

describe("BrokersView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders broker names in the table", () => {
    render(<BrokersView brokers={brokers} canCreate canEdit canDelete />);
    expect(screen.getByText("Raj Broker")).toBeInTheDocument();
    expect(screen.getByText("Priya Deals")).toBeInTheDocument();
  });

  it("renders agency label under broker name", () => {
    render(<BrokersView brokers={brokers} canCreate canEdit canDelete />);
    expect(screen.getByText("City Realty")).toBeInTheDocument();
  });

  it("renders Add Broker button when canCreate is true", () => {
    render(<BrokersView brokers={brokers} canCreate canEdit canDelete />);
    expect(screen.getByText("Add Broker")).toBeInTheDocument();
  });

  it("does not render Add Broker when canCreate is false", () => {
    render(<BrokersView brokers={brokers} canCreate={false} canEdit canDelete />);
    expect(screen.queryByText("Add Broker")).not.toBeInTheDocument();
  });

  it("renders empty state when no brokers", () => {
    render(<BrokersView brokers={[]} canCreate canEdit canDelete />);
    expect(screen.getByText("No brokers yet")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<BrokersView brokers={brokers} canCreate canEdit canDelete />);
    expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
  });

  it("filters brokers by search query", () => {
    render(<BrokersView brokers={brokers} canCreate canEdit canDelete />);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: "Raj" } });
    expect(screen.getByText("Raj Broker")).toBeInTheDocument();
    expect(screen.queryByText("Priya Deals")).not.toBeInTheDocument();
  });
});

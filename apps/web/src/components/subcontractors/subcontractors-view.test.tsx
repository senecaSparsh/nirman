// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { SubcontractorsView } from "./subcontractors-view";
import type { SubcontractorRow } from "@/lib/types";

const subs: SubcontractorRow[] = [
  { id: "s1", name: "Ramesh Electricals", gstin: "27ABC1234F1Z5", phone: "9876543210", email: null, address: "Pune", trade: "Electrical", workOrderCount: 3, activeWorkOrderCount: 1, totalWorkDone: 150000, totalPaid: 100000, retentionBalance: 5000 },
  { id: "s2", name: "Suresh Plumbing", gstin: null, phone: null, email: null, address: null, trade: "Plumbing", workOrderCount: 0, activeWorkOrderCount: 0, totalWorkDone: 0, totalPaid: 0, retentionBalance: 0 },
];

describe("SubcontractorsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders subcontractor names in the table", () => {
    render(<SubcontractorsView subcontractors={subs} canCreate canEdit canDelete />);
    expect(screen.getByText("Ramesh Electricals")).toBeInTheDocument();
    expect(screen.getByText("Suresh Plumbing")).toBeInTheDocument();
  });

  it("renders trade labels under names", () => {
    render(<SubcontractorsView subcontractors={subs} canCreate canEdit canDelete />);
    expect(screen.getByText("Electrical")).toBeInTheDocument();
    expect(screen.getByText("Plumbing")).toBeInTheDocument();
  });

  it("renders Add Subcontractor button when canCreate is true", () => {
    render(<SubcontractorsView subcontractors={subs} canCreate canEdit canDelete />);
    expect(screen.getByText("Add Subcontractor")).toBeInTheDocument();
  });

  it("does not render Add Subcontractor when canCreate is false", () => {
    render(<SubcontractorsView subcontractors={subs} canCreate={false} canEdit canDelete />);
    expect(screen.queryByText("Add Subcontractor")).not.toBeInTheDocument();
  });

  it("renders empty state when no subcontractors", () => {
    render(<SubcontractorsView subcontractors={[]} canCreate canEdit canDelete />);
    expect(screen.getByText("No subcontractors yet")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<SubcontractorsView subcontractors={subs} canCreate canEdit canDelete />);
    expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
  });

  it("filters subcontractors by search query", () => {
    render(<SubcontractorsView subcontractors={subs} canCreate canEdit canDelete />);
    const search = screen.getByPlaceholderText(/Search/);
    fireEvent.change(search, { target: { value: "Ramesh" } });
    expect(screen.getByText("Ramesh Electricals")).toBeInTheDocument();
    expect(screen.queryByText("Suresh Plumbing")).not.toBeInTheDocument();
  });
});

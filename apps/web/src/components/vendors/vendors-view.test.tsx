// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
  };
});

import { VendorsView, type VendorRow } from "./vendors-view";

const vendors: VendorRow[] = [
  {
    id: "v1",
    name: "Acme Supplies",
    gstin: "27ABCDE1234F1Z5",
    phone: "9876543210",
    email: "acme@test.com",
    address: "Mumbai",
    balanceOwed: 50000,
    leadTimeDays: 7,
    totalPOs: 10,
    openPOs: 2,
    totalSpent: 500000,
    recentPOs: [],
  },
  {
    id: "v2",
    name: "Steel Corp",
    gstin: null,
    phone: null,
    email: null,
    address: null,
    balanceOwed: 0,
    leadTimeDays: null,
    totalPOs: 5,
    openPOs: 0,
    totalSpent: 200000,
    recentPOs: [],
  },
];

describe("VendorsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders Directory and Ratings tabs", () => {
    render(<VendorsView vendors={vendors} permissions={{ canManage: true }} />);
    expect(screen.getByRole("tab", { name: /Directory/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ratings/ })).toBeInTheDocument();
  });

  it("renders vendor names in the directory table", () => {
    render(<VendorsView vendors={vendors} permissions={{ canManage: true }} />);
    expect(screen.getByText("Acme Supplies")).toBeInTheDocument();
    expect(screen.getByText("Steel Corp")).toBeInTheDocument();
  });

  it("renders Add vendor button when canManage is true", () => {
    render(<VendorsView vendors={vendors} permissions={{ canManage: true }} />);
    expect(screen.getByText("Add vendor")).toBeInTheDocument();
  });

  it("renders empty state when no vendors", () => {
    render(<VendorsView vendors={[]} permissions={{ canManage: true }} />);
    expect(screen.getByText("No vendors yet")).toBeInTheDocument();
  });

  it("renders CSV Import button when canManage is true", () => {
    render(<VendorsView vendors={vendors} permissions={{ canManage: true }} />);
    expect(screen.getByText("CSV Import")).toBeInTheDocument();
  });

  it("does not render Add vendor or CSV Import when canManage is false", () => {
    render(<VendorsView vendors={vendors} permissions={{ canManage: false }} />);
    expect(screen.queryByText("Add vendor")).not.toBeInTheDocument();
    expect(screen.queryByText("CSV Import")).not.toBeInTheDocument();
  });

  it("opens create form dialog when Add vendor is clicked", () => {
    render(<VendorsView vendors={vendors} permissions={{ canManage: true }} />);
    fireEvent.click(screen.getByText("Add vendor"));
    // The form dialog should open with the Name field
    expect(screen.getByRole("heading", { name: "Add Vendor" })).toBeInTheDocument();
  });
});

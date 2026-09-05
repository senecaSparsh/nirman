// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders prettified status text", () => {
    render(<StatusBadge status="PARTIAL" />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });

  it("renders custom label when provided", () => {
    render(<StatusBadge status="PARTIAL" label="Partial Receipt" />);
    expect(screen.getByText("Partial Receipt")).toBeInTheDocument();
  });

  it("prettifies multi-word status (SUB_ADMIN_APPROVED)", () => {
    render(<StatusBadge status="SUB_ADMIN_APPROVED" />);
    expect(screen.getByText("Sub Admin Approved")).toBeInTheDocument();
  });

  it("renders a dot by default", () => {
    const { container } = render(<StatusBadge status="APPROVED" />);
    const badge = screen.getByText("Approved");
    const dot = badge.querySelector("span");
    expect(dot).not.toBeNull();
  });

  it("does not render a dot when dot is false", () => {
    render(<StatusBadge status="APPROVED" dot={false} />);
    const badge = screen.getByText("Approved");
    const dot = badge.querySelector("span");
    expect(dot).toBeNull();
  });

  it.each([
    ["DRAFT", "Draft"],
    ["SUBMITTED", "Submitted"],
    ["PENDING", "Pending"],
    ["APPROVED", "Approved"],
    ["ACTIVE", "Active"],
    ["ORDERED", "Ordered"],
    ["PARTIAL", "Partial"],
    ["COUNTED", "Counted"],
    ["RECEIVED", "Received"],
    ["COMPLETED", "Completed"],
    ["PAID", "Paid"],
    ["REJECTED", "Rejected"],
    ["CANCELLED", "Cancelled"],
    ["FAILED", "Failed"],
    ["OVERDUE", "Overdue"],
    ["SOLD", "Sold"],
    ["PARTITIONED", "Partitioned"],
    ["RETIRED", "Retired"],
  ])("renders status %s as %s", (status, expected) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("falls back to draft category for unknown status", () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    expect(screen.getByText("Unknown Status")).toBeInTheDocument();
  });

  it("handles lowercase status input", () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});

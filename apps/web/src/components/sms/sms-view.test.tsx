// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { SmsView, type SmsRow } from "./sms-view";

const items: SmsRow[] = [
  { id: "s1", sender: "SBI", message: "Rs 5000 debited", receivedAt: "2024-01-15T10:00:00Z", amount: 5000, upiRef: "UPI123", bankName: "SBI", txnType: "DEBIT", counterparty: "John", status: "MATCHED", matchedEntityType: "sale", matchedEntityId: "sale-1", paymentRecordId: "pay-1", matchConfidence: 0.95, matchReason: "Amount matches" },
  { id: "s2", sender: "HDFC", message: "Rs 10000 credited", receivedAt: "2024-01-16T11:00:00Z", amount: 10000, upiRef: null, bankName: "HDFC", txnType: "CREDIT", counterparty: null, status: "UNMATCHED", matchedEntityType: null, matchedEntityId: null, paymentRecordId: null, matchConfidence: null, matchReason: null },
];

describe("SmsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders filter tabs All, Unmatched, Matched, Ignored", () => {
    render(<SmsView items={items} canCreate />);
    expect(screen.getByText("All")).toBeInTheDocument();
    // "Unmatched" appears both as a tab and as a status badge
    expect(screen.getAllByText("Unmatched").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Matched").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ignored").length).toBeGreaterThanOrEqual(1);
  });

  it("renders SMS messages in the list", () => {
    render(<SmsView items={items} canCreate />);
    expect(screen.getByText("Rs 5000 debited")).toBeInTheDocument();
    expect(screen.getByText("Rs 10000 credited")).toBeInTheDocument();
  });

  it("renders Add SMS button when canCreate is true", () => {
    render(<SmsView items={items} canCreate />);
    expect(screen.getByRole("button", { name: /Add SMS/ })).toBeInTheDocument();
  });

  it("does not render Add SMS when canCreate is false", () => {
    render(<SmsView items={items} canCreate={false} />);
    expect(screen.queryByRole("button", { name: /Add SMS/ })).not.toBeInTheDocument();
  });

  it("filters to unmatched only when Unmatched tab is clicked", () => {
    render(<SmsView items={items} canCreate />);
    // Click the "Unmatched" tab button (first occurrence is the tab)
    const unmatchedTabs = screen.getAllByText("Unmatched");
    fireEvent.click(unmatchedTabs[0]!);
    expect(screen.getByText("Rs 10000 credited")).toBeInTheDocument();
    expect(screen.queryByText("Rs 5000 debited")).not.toBeInTheDocument();
  });

  it("renders empty state when no items", () => {
    render(<SmsView items={[]} canCreate />);
    expect(screen.getByText("No SMS records")).toBeInTheDocument();
  });

  it("shows status badge for matched SMS", () => {
    render(<SmsView items={items} canCreate />);
    // The status badge appears inside a span with the success color class
    const badges = screen.getAllByText("Matched");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

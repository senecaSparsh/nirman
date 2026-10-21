// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";

// CallsView reads/writes filters via useUrlFilter/useUrlQuery/useQueryParam,
// which need a router + search params context.
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/calls",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

import { CallsView } from "./calls-view";

const calls = [
  {
    id: "c1",
    direction: "INBOUND" as const,
    fromNumber: "9876543210",
    toNumber: "9123456789",
    status: "ANSWERED" as const,
    startedAt: "2024-01-15T10:00:00Z",
    durationSec: 120,
    disposition: null,
    notes: "Discussed project timeline",
    source: "TWILIO",
    legalHold: false,
    companyPhoneId: "ph1",
    callerUserId: null,
    calleeUserId: "u1",
    relatedProjectId: null,
    recording: null,
    voicemail: null,
    companyPhone: { id: "ph1", phoneNumber: "9123456789", label: "Main" },
    caller: { id: "ext1", name: "Ramesh" },
    callee: { id: "u1", name: "Suresh" },
    tags: [],
  },
  {
    id: "c2",
    direction: "OUTBOUND" as const,
    fromNumber: "9123456789",
    toNumber: "9876543210",
    status: "MISSED" as const,
    startedAt: "2024-01-16T11:00:00Z",
    durationSec: 0,
    disposition: null,
    notes: null,
    source: "TWILIO",
    legalHold: false,
    companyPhoneId: "ph1",
    callerUserId: "u1",
    calleeUserId: null,
    relatedProjectId: null,
    recording: null,
    voicemail: { id: "vm1" },
    companyPhone: { id: "ph1", phoneNumber: "9123456789", label: "Main" },
    caller: { id: "u1", name: "Suresh" },
    callee: null,
    tags: [],
  },
];

const phoneNumbers = [{ id: "ph1", phoneNumber: "9123456789", label: "Main", department: null }];
const tags = [{ id: "t1", name: "Important", color: "red" }];

const baseProps = {
  calls,
  phoneNumbers,
  tags,
  total: calls.length,
  missedCount: 1,
  totalDurationSec: 120,
  page: 1,
  pageCount: 1,
  canViewAll: true,
  canViewFullNumber: true,
  canCreate: true,
  canListenRecording: true,
};

describe("CallsView", () => {
  it("renders the call count in the toolbar", () => {
    render(<CallsView {...baseProps} />);
    // ToolbarCount + pagination both carry the "N calls" count.
    expect(screen.getAllByText("2 calls").length).toBeGreaterThan(0);
  });

  it("renders Log Call button when canCreate is true", () => {
    render(<CallsView {...baseProps} />);
    expect(screen.getByRole("button", { name: /Log Call/ })).toBeInTheDocument();
  });

  it("does not render Log Call button when canCreate is false", () => {
    render(<CallsView {...baseProps} canCreate={false} />);
    expect(screen.queryByRole("button", { name: /Log Call/ })).not.toBeInTheDocument();
  });

  it("renders search input with placeholder", () => {
    render(<CallsView {...baseProps} />);
    expect(screen.getByPlaceholderText("Search by number, name, or notes…")).toBeInTheDocument();
  });

  it("renders filter dropdowns for direction, status, and phone", () => {
    render(<CallsView {...baseProps} />);
    expect(screen.getByText("All directions")).toBeInTheDocument();
    expect(screen.getByText("All statuses")).toBeInTheDocument();
    expect(screen.getByText("All numbers")).toBeInTheDocument();
  });

  it("search input accepts typed text (value is URL-backed)", () => {
    render(<CallsView {...baseProps} />);
    const search = screen.getByPlaceholderText("Search by number, name, or notes…");
    fireEvent.change(search, { target: { value: "Ramesh" } });
    expect(search).toHaveValue("Ramesh");
  });

  it("renders rows for the calls it is given", () => {
    render(<CallsView {...baseProps} />);
    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    expect(screen.getByText("Suresh")).toBeInTheDocument();
  });

  it("renders empty state when no calls match", () => {
    render(<CallsView {...baseProps} calls={[]} total={0} missedCount={0} totalDurationSec={0} />);
    expect(screen.getByText("No calls found")).toBeInTheDocument();
  });

  it("renders pagination controls when pageCount > 1", () => {
    render(<CallsView {...baseProps} page={1} pageCount={3} total={140} />);
    expect(screen.getByText("Page 1 of 3 · 140 calls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});

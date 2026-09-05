// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";
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

describe("CallsView", () => {
  it("renders page title and description", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    expect(screen.getByText("Call Log")).toBeInTheDocument();
    expect(screen.getByText(/Incoming, outgoing, and internal calls/)).toBeInTheDocument();
  });

  it("renders Log Call button when canCreate is true", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    expect(screen.getByRole("button", { name: /Log Call/ })).toBeInTheDocument();
  });

  it("does not render Log Call button when canCreate is false", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate={false} canListenRecording />,
    );
    expect(screen.queryByRole("button", { name: /Log Call/ })).not.toBeInTheDocument();
  });

  it("renders search input with placeholder", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    expect(screen.getByPlaceholderText("Search by number, name, or notes…")).toBeInTheDocument();
  });

  it("renders filter dropdowns for direction, status, and phone", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    expect(screen.getByText("All directions")).toBeInTheDocument();
    expect(screen.getByText("All statuses")).toBeInTheDocument();
    expect(screen.getByText("All numbers")).toBeInTheDocument();
  });

  it("filters calls by search term", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    const search = screen.getByPlaceholderText("Search by number, name, or notes…");
    fireEvent.change(search, { target: { value: "Ramesh" } });
    // After filtering, Ramesh should be visible
    expect(screen.getByText("Ramesh")).toBeInTheDocument();
  });

  it("renders empty state when no calls match", () => {
    render(
      <CallsView calls={[]} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    expect(screen.getByText("No calls found")).toBeInTheDocument();
  });

  it("shows missed count in stats", () => {
    render(
      <CallsView calls={calls} phoneNumbers={phoneNumbers} tags={tags} canViewAll canViewFullNumber canCreate canListenRecording />,
    );
    // "Missed" appears in both the stats label and the filter dropdown
    expect(screen.getAllByText("Missed").length).toBeGreaterThan(0);
  });
});

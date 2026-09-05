// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@/test/render";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

vi.mock("@nirman/services", () => ({
  resolveUserScope: vi.fn(async () => null),
  logAction: vi.fn(async () => {}),
  ServiceError: class ServiceError extends Error {},
}));

vi.mock("@/components/calls/call-detail-view", () => ({
  CallDetailView: (props: { call: { id: string; direction: string }; canEdit: boolean }) => (
    <div data-testid="call-detail-view">
      <span data-testid="call-id">{props.call.id}</span>
      <span data-testid="can-edit">{String(props.canEdit)}</span>
    </div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { CallDetailContent } from "./page";

describe("CallDetailPage (CallDetailContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders CallDetailView with call data", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue({
      id: "c1", direction: "OUTBOUND", fromNumber: "+919876543210",
      toNumber: "+911234567890", status: "COMPLETED",
      startedAt: new Date("2024-06-01T10:00:00Z"), connectedAt: new Date("2024-06-01T10:00:05Z"),
      endedAt: new Date("2024-06-01T10:01:00Z"), durationSec: 55, ringDurationSec: 5,
      disposition: null, notes: null, source: "MANUAL", legalHold: false,
      callCost: "1.50", provider: "TWILIO", providerCallId: "CA123",
      recordingConsent: true, relatedProjectId: null,
      companyPhone: { id: "cp1", phoneNumber: "+911234567890", label: "Main" },
      caller: { id: "u1", name: "Alice", email: "alice@test.com" },
      callee: { id: "u2", name: "Bob", email: "bob@test.com" },
      recording: null, voicemail: null, callNotes: [], tags: [],
    });

    const ui = await CallDetailContent({ id: "c1" });
    render(ui);
    expect(screen.getByTestId("call-detail-view")).toBeInTheDocument();
    expect(screen.getByTestId("call-id")).toHaveTextContent("c1");
  });

  it("calls notFound when call does not exist", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue(null);

    await expect(CallDetailContent({ id: "nonexistent" })).rejects.toThrow();
  });

  it("shows NoAccess for a role without CALL_VIEW", async () => {
    setSessionUser({ role: "ACCOUNTANT" });
    const ui = await CallDetailContent({ id: "c1" });
    render(ui);
    expect(screen.queryByTestId("call-detail-view")).not.toBeInTheDocument();
  });

  it("passes canEdit=true for OWNER role", async () => {
    mockPrisma().callLog!.findFirst.mockResolvedValue({
      id: "c1", direction: "INBOUND", fromNumber: "+919876543210",
      toNumber: "+911234567890", status: "COMPLETED",
      startedAt: new Date("2024-06-01T10:00:00Z"), connectedAt: null,
      endedAt: new Date("2024-06-01T10:01:00Z"), durationSec: 60, ringDurationSec: 0,
      disposition: null, notes: null, source: "INBOUND", legalHold: false,
      callCost: null, provider: "TWILIO", providerCallId: null,
      recordingConsent: false, relatedProjectId: null,
      companyPhone: null, caller: null, callee: null,
      recording: null, voicemail: null, callNotes: [], tags: [],
    });

    const ui = await CallDetailContent({ id: "c1" });
    render(ui);
    expect(screen.getByTestId("can-edit")).toHaveTextContent("true");
  });
});

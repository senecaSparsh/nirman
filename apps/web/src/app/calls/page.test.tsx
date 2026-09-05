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

vi.mock("@/components/calls/calls-view", () => ({
  CallsView: (props: { calls: unknown[]; phoneNumbers: unknown[]; tags: unknown[]; canViewAll: boolean; canViewFullNumber: boolean; canCreate: boolean; canListenRecording: boolean }) => (
    <div data-testid="calls-view">
      <span data-testid="calls-count">{props.calls.length}</span>
      <span data-testid="phones-count">{props.phoneNumbers.length}</span>
      <span data-testid="tags-count">{props.tags.length}</span>
      <span data-testid="can-view-all">{String(props.canViewAll)}</span>
      <span data-testid="can-create">{String(props.canCreate)}</span>
      <span data-testid="calls-json">{JSON.stringify(props.calls)}</span>
    </div>
  ),
}));

vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { CallsContent } from "./page";

describe("CallsPage (CallsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().callLog!.findMany.mockResolvedValue([]);
    mockPrisma().companyPhone!.findMany.mockResolvedValue([]);
    mockPrisma().callTag!.findMany.mockResolvedValue([]);
  });

  it("renders the CallsView with fetched data", async () => {
    const ui = await CallsContent();
    render(ui);
    expect(screen.getByTestId("calls-view")).toBeInTheDocument();
    expect(screen.getByTestId("calls-count")).toHaveTextContent("0");
  });

  it("renders calls with serialized data", async () => {
    const startedAt = new Date("2024-12-01T10:00:00Z");
    mockPrisma().callLog!.findMany.mockResolvedValue([
      {
        id: "c1", direction: "INBOUND", fromNumber: "+1234", toNumber: "+5678",
        status: "ANSWERED", startedAt, durationSec: 120, disposition: null,
        notes: null, source: "MANUAL", legalHold: false, companyPhoneId: null,
        callerUserId: null, calleeUserId: null, relatedProjectId: null,
        recording: null, voicemail: null, companyPhone: null,
        caller: null, callee: null, tags: [],
      },
    ]);

    const ui = await CallsContent();
    render(ui);

    expect(screen.getByTestId("calls-count")).toHaveTextContent("1");
    const calls = JSON.parse(screen.getByTestId("calls-json").textContent!);
    expect(calls[0].id).toBe("c1");
    expect(calls[0].startedAt).toBe(startedAt.toISOString());
    expect(calls[0].direction).toBe("INBOUND");
  });

  it("passes canViewAll=true for OWNER role", async () => {
    const ui = await CallsContent();
    render(ui);
    expect(screen.getByTestId("can-view-all")).toHaveTextContent("true");
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });

  it("passes canViewAll=false for SITE_ENGINEER role (lacks CALL_VIEW_ALL)", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await CallsContent();
    render(ui);
    expect(screen.getByTestId("can-view-all")).toHaveTextContent("false");
  });

  it("shows NoAccess for a role without CALL_VIEW", async () => {
    // FINANCE_HEAD lacks CALL_VIEW... actually FINANCE_HEAD has CALL_VIEW.
    // ACCOUNTANT lacks CALL_VIEW
    setSessionUser({ role: "ACCOUNTANT" });
    const ui = await CallsContent();
    render(ui);
    expect(screen.queryByTestId("calls-view")).not.toBeInTheDocument();
  });

  it("renders phone numbers and tags", async () => {
    mockPrisma().companyPhone!.findMany.mockResolvedValue([
      { id: "ph1", phoneNumber: "+9199999", label: "Main", department: "SALES" },
    ]);
    mockPrisma().callTag!.findMany.mockResolvedValue([
      { id: "t1", name: "Important", color: "red" },
    ]);

    const ui = await CallsContent();
    render(ui);
    expect(screen.getByTestId("phones-count")).toHaveTextContent("1");
    expect(screen.getByTestId("tags-count")).toHaveTextContent("1");
  });
});

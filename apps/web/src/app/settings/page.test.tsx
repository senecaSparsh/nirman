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

vi.mock("@/components/settings/settings-view", () => ({
  SettingsView: (props: { company: unknown; users: unknown[]; locations: unknown[]; projects: unknown[]; subcontractors: unknown[]; employees: unknown[]; companies: unknown[]; canManageCompanies: boolean; actorRole: string; departments: unknown[]; managers: unknown[] }) => (
    <div data-testid="settings-view">
      <span data-testid="users-count">{props.users.length}</span>
      <span data-testid="locations-count">{props.locations.length}</span>
      <span data-testid="companies-count">{props.companies.length}</span>
      <span data-testid="can-manage-companies">{String(props.canManageCompanies)}</span>
      <span data-testid="actor-role">{props.actorRole}</span>
      <span data-testid="settings-json">{JSON.stringify({ company: props.company, locations: props.locations, departments: props.departments })}</span>
    </div>
  ),
}));

vi.mock("@/components/notifications/notifications-panel", () => ({
  NotificationsPanel: () => <div data-testid="notifications-panel">Notifications</div>,
}));
vi.mock("@/components/notifications/notification-preferences", () => ({
  NotificationPreferences: () => <div data-testid="notification-prefs">Prefs</div>,
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string }) => (
    <div data-testid="page-header"><h1>{props.title}</h1></div>
  ),
}));
vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { SettingsContent } from "./page";

describe("SettingsPage (SettingsContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().user!.findMany.mockResolvedValue([]);
    mockPrisma().stockLocation!.findMany.mockResolvedValue([]);
    mockPrisma().project!.findMany.mockResolvedValue([]);
    mockPrisma().subcontractor!.findMany.mockResolvedValue([]);
    mockPrisma().employee!.findMany.mockResolvedValue([]);
    mockPrisma().company!.findMany.mockResolvedValue([]);
    mockPrisma().department!.findMany.mockResolvedValue([]);
    mockPrisma().userCompany!.findMany.mockResolvedValue([]);
  });

  it("renders the SettingsView", async () => {
    const ui = await SettingsContent();
    render(ui);
    expect(screen.getByTestId("settings-view")).toBeInTheDocument();
  });

  it("renders with fetched users and locations", async () => {
    mockPrisma().user!.findMany.mockResolvedValue([
      { id: "u1", email: "a@t.com", name: "Alice", role: "OWNER", active: true, phone: null, designation: null, department: null, employeeCode: null, joiningDate: null },
    ]);
    mockPrisma().stockLocation!.findMany.mockResolvedValue([
      { id: "l1", type: "WAREHOUSE", name: "Main WH", address: "Mumbai", projectId: null, project: null, stockItems: [{ qty: 100, movingAvgCost: 50 }] },
    ]);

    const ui = await SettingsContent();
    render(ui);
    expect(screen.getByTestId("users-count")).toHaveTextContent("1");
    expect(screen.getByTestId("locations-count")).toHaveTextContent("1");
  });

  it("passes canManageCompanies=true for OWNER role", async () => {
    const ui = await SettingsContent();
    render(ui);
    expect(screen.getByTestId("can-manage-companies")).toHaveTextContent("true");
    expect(screen.getByTestId("actor-role")).toHaveTextContent("OWNER");
  });

  it("shows NoAccess for a role without COMPANY_MANAGE", async () => {
    // SITE_ENGINEER lacks COMPANY_MANAGE
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await SettingsContent();
    render(ui);
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
  });

  it("computes stock value from stockItems for locations", async () => {
    mockPrisma().stockLocation!.findMany.mockResolvedValue([
      { id: "l1", type: "WAREHOUSE", name: "WH1", address: null, projectId: null, project: null, stockItems: [{ qty: 100, movingAvgCost: 50 }, { qty: 200, movingAvgCost: 30 }] },
    ]);

    const ui = await SettingsContent();
    render(ui);

    const data = JSON.parse(screen.getByTestId("settings-json").textContent!);
    expect(data.locations[0].stockValue).toBe(100 * 50 + 200 * 30); // 11000
    expect(data.locations[0].itemCount).toBe(2); // both have qty > 0
  });

  it("renders NotificationsPanel for roles with FINANCE_MANAGE", async () => {
    const ui = await SettingsContent();
    render(ui);
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
  });

  it("renders NotificationPreferences for all roles", async () => {
    const ui = await SettingsContent();
    render(ui);
    expect(screen.getByTestId("notification-prefs")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a bell button", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);
    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: /^Notifications$/ })).toBeInTheDocument();
  });

  it("shows unread count badge when there are unread notifications", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          { id: "1", eventType: "TASK_ASSIGNED", title: "New task", message: "You have a new task", link: null, isRead: false, readAt: null, createdAt: new Date().toISOString() },
        ],
        unreadCount: 3,
      }),
    } as Response);
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("shows 99+ when unread count exceeds 99", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [],
        unreadCount: 150,
      }),
    } as Response);
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText("99+")).toBeInTheDocument();
    });
  });

  it("does not show badge when unread count is 0", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);
    render(<NotificationBell />);
    expect(screen.queryByText("99+")).not.toBeInTheDocument();
  });

  it("opens dropdown with notifications when bell is clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          { id: "1", eventType: "TASK_ASSIGNED", title: "New task", message: "You have a new task", link: null, isRead: false, readAt: null, createdAt: new Date().toISOString() },
        ],
        unreadCount: 1,
      }),
    } as Response);
    const { user } = render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    // The dropdown content renders after the state update — use findByText to wait.
    expect(await screen.findByText("New task", undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);
    const { user } = render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("All clear — nothing needs you")).toBeInTheDocument();
  });

  it("shows the Needs attention section when alert items are passed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);
    const { user } = render(
      <NotificationBell
        alertItems={[
          { href: "/approvals", label: "approvals waiting", count: 2, urgency: "blocking" },
        ]}
      />,
    );
    // Alert count is folded into the badge total.
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/2 approvals waiting/)).toBeInTheDocument();
  });

  it("shows Mark all read button when there are unread notifications", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          { id: "1", eventType: "T", title: "Test", message: "Msg", link: null, isRead: false, readAt: null, createdAt: new Date().toISOString() },
        ],
        unreadCount: 1,
      }),
    } as Response);
    const { user } = render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Mark all read")).toBeInTheDocument();
  });
});

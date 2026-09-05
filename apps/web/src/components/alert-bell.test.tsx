// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { AlertBell } from "./alert-bell";

describe("AlertBell", () => {
  it("renders a bell button", () => {
    render(<AlertBell items={[]} />);
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeInTheDocument();
  });

  it("shows total count badge when items have counts", () => {
    render(
      <AlertBell
        items={[
          { href: "/a", label: "Approvals", count: 3, urgency: "blocking" },
          { href: "/b", label: "Low stock", count: 2, urgency: "soon" },
        ]}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows 99+ when total exceeds 99", () => {
    render(
      <AlertBell
        items={[{ href: "/a", label: "Items", count: 100, urgency: "blocking" }]}
      />,
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("does not show badge when total is 0", () => {
    render(<AlertBell items={[]} />);
    expect(screen.queryByText("99+")).not.toBeInTheDocument();
  });

  it("opens dropdown when bell is clicked", async () => {
    const { user } = render(
      <AlertBell
        items={[
          { href: "/approvals", label: "Approvals", count: 3, urgency: "blocking" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getByText(/3 Approvals/)).toBeInTheDocument();
  });

  it("shows all clear message when no items", async () => {
    const { user } = render(<AlertBell items={[]} />);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("All clear — nothing needs you.")).toBeInTheDocument();
  });

  it("groups items by urgency", async () => {
    const { user } = render(
      <AlertBell
        items={[
          { href: "/a", label: "Approvals", count: 1, urgency: "blocking" },
          { href: "/b", label: "Low stock", count: 2, urgency: "soon" },
          { href: "/c", label: "Sync pending", count: 1, urgency: "info" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getByText("Coming up")).toBeInTheDocument();
    expect(screen.getByText("For your information")).toBeInTheDocument();
  });

  it("renders links with correct hrefs", async () => {
    const { user } = render(
      <AlertBell
        items={[
          { href: "/approvals", label: "Approvals", count: 1, urgency: "blocking" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    const link = screen.getByRole("link", { name: /1 Approvals/ });
    expect(link).toHaveAttribute("href", "/approvals");
  });

  it("shows Dismiss button when there are items", async () => {
    const { user } = render(
      <AlertBell items={[{ href: "/a", label: "Test", count: 1, urgency: "info" }]} />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });
});

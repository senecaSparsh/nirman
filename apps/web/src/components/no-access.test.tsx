// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { NoAccess } from "./no-access";

describe("NoAccess", () => {
  it("renders the default message with 'this page'", () => {
    render(<NoAccess />);
    expect(screen.getByText(/This page isn't part of your role/i)).toBeInTheDocument();
  });

  it("renders custom 'what' text", () => {
    render(<NoAccess what="the finance module" />);
    expect(screen.getByText(/The finance module isn't part of your role/i)).toBeInTheDocument();
  });

  it("renders the description text", () => {
    render(<NoAccess what="this page" />);
    expect(screen.getByText(/Your account doesn't include access to this page/i)).toBeInTheDocument();
  });

  it("renders permission when provided", () => {
    render(<NoAccess what="reports" permission="VIEW_REPORTS" />);
    expect(screen.getByText("VIEW_REPORTS")).toBeInTheDocument();
  });

  it("does not render permission when not provided", () => {
    render(<NoAccess what="reports" />);
    expect(screen.queryByText("VIEW_REPORTS")).not.toBeInTheDocument();
  });

  it("renders a Back to Today link", () => {
    render(<NoAccess />);
    const link = screen.getByRole("link", { name: "Back to Today" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders a Lock icon", () => {
    const { container } = render(<NoAccess />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("capitalizes the first letter of what", () => {
    render(<NoAccess what="materials" />);
    expect(screen.getByText(/Materials isn't part of your role/i)).toBeInTheDocument();
  });
});

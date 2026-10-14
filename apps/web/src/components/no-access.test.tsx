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

  it("names the permission in plain words when provided", () => {
    render(<NoAccess what="reports" permission="finance.view" />);
    expect(screen.getByText("Finance View")).toBeInTheDocument();
    expect(screen.queryByText("finance.view")).not.toBeInTheDocument();
  });

  it("does not name a permission when not provided", () => {
    render(<NoAccess what="reports" />);
    expect(screen.queryByText("Finance View")).not.toBeInTheDocument();
  });

  it("replaces the grant sentence with a note when access cannot be granted", () => {
    render(<NoAccess what="the audit trail" note="Only the owner can open this." />);
    expect(screen.getByText(/Only the owner can open this\./)).toBeInTheDocument();
    expect(screen.queryByText(/An owner or administrator can grant it/)).not.toBeInTheDocument();
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

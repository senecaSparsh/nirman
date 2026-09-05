// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("@/components/currency-provider", () => ({
  useCurrencyMode: vi.fn(() => ({ mode: "compact", toggle: vi.fn() })),
}));

import { CurrencyToggle } from "./currency-toggle";

describe("CurrencyToggle", () => {
  it("renders a button with currency display text", () => {
    render(<CurrencyToggle />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows compact text when mode is compact", () => {
    render(<CurrencyToggle />);
    expect(screen.getByText("₹1.2L")).toBeInTheDocument();
  });

  it("has an aria-label describing the current mode", () => {
    render(<CurrencyToggle />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", expect.stringContaining("compact"));
  });

  it("has a title attribute with mode description", () => {
    render(<CurrencyToggle />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toContain("Compact mode");
  });
});

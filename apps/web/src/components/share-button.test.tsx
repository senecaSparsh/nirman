// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { ShareButton, WhatsAppShareLink } from "./share-button";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareButton", () => {
  it("renders a button with the label", () => {
    render(<ShareButton text="Check this out" label="Share" />);
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("renders with default label when not specified", () => {
    render(<ShareButton text="Check this" />);
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<ShareButton text="Check this" label="Send" />);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("copies to clipboard and shows Copied text when navigator.share is not available", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true, writable: true });
    const { user } = render(<ShareButton text="Test text" url="https://example.com" />);
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("Copied", undefined, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe("WhatsAppShareLink", () => {
  it("renders an anchor with wa.me href", () => {
    render(<WhatsAppShareLink text="Hello" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });

  it("includes the text in the URL", () => {
    render(<WhatsAppShareLink text="Hello World" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("Hello%20World");
  });

  it("includes the number in the URL when provided", () => {
    render(<WhatsAppShareLink text="Hello" number="919999999999" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("919999999999");
  });

  it("includes url in the text when provided", () => {
    render(<WhatsAppShareLink text="Hello" url="https://example.com" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("https%3A%2F%2Fexample.com");
  });

  it("renders custom children when provided", () => {
    render(<WhatsAppShareLink text="Hello">Share via WhatsApp</WhatsAppShareLink>);
    expect(screen.getByText("Share via WhatsApp")).toBeInTheDocument();
  });

  it("renders default children text when no children provided", () => {
    render(<WhatsAppShareLink text="Hello" />);
    expect(screen.getByText("Share on WhatsApp")).toBeInTheDocument();
  });
});

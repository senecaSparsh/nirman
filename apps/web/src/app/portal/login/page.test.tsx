// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import PortalLoginPage from "./page";

describe("PortalLoginPage", () => {
  it("renders the Customer Portal heading", () => {
    render(<PortalLoginPage />);
    expect(screen.getByText("Customer Portal")).toBeInTheDocument();
  });

  it("renders the phone input field in the initial step", () => {
    render(<PortalLoginPage />);
    expect(screen.getByPlaceholderText("+91 98XXX XXXXX")).toBeInTheDocument();
  });

  it("renders the Send Login Code button", () => {
    render(<PortalLoginPage />);
    expect(screen.getByText("Send Login Code")).toBeInTheDocument();
  });

  it("renders the OTP authentication footer text", () => {
    render(<PortalLoginPage />);
    expect(screen.getByText("Protected by OTP authentication")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    render(<PortalLoginPage />);
    expect(screen.getByText(/View your bookings, payments & documents/)).toBeInTheDocument();
  });
});

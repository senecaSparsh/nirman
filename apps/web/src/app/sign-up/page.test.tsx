// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";

// Mock next/navigation useRouter
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

// Mock authClient — use vi.hoisted so the mock fn is available to the hoisted vi.mock factory
const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: mockSignIn,
    },
  },
}));

// Mock UI components
vi.mock("@/components/ui/button", () => ({
  Button: (props: { children: React.ReactNode; disabled?: boolean; type?: "button" | "submit" | "reset" }) => (
    <button type={props.type ?? "button"} disabled={props.disabled} data-testid="submit-btn">
      {props.children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props} />
  ),
}));

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

import SignUpPage from "./page";

describe("SignUpPage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSignIn.mockReset();
    mockSignIn.mockResolvedValue({ error: null });
  });

  it("shows loading spinner while checking bootstrap status", () => {
    // fetch never resolves → stays in checking state
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<SignUpPage />);

    // While checking, it renders a spinner (Loader2), not the submit button.
    expect(screen.queryByTestId("submit-btn")).not.toBeInTheDocument();
  });

  it("shows the setup form when bootstrap is needed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ needsBootstrap: true }),
    });

    render(<SignUpPage />);

    await waitFor(() => {
      expect(screen.getByText("Set up Nirman")).toBeInTheDocument();
    });
    expect(screen.getByText(/Create your owner account/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Vardaan Constructions")).toBeInTheDocument();
  });

  it("renders all form fields — company name, owner name, email, password", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ needsBootstrap: true }),
    });

    render(<SignUpPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Company Name")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Your Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows the note about one-time setup", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ needsBootstrap: true }),
    });

    render(<SignUpPage />);

    await waitFor(() => {
      expect(screen.getByText("This setup is only available once, for the first owner.")).toBeInTheDocument();
    });
  });
});

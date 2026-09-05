// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("@/lib/use-recently-viewed", () => ({
  useRecentlyViewed: vi.fn(() => []),
}));

import { CommandPalette } from "./command-palette";

describe("CommandPalette", () => {
  it("renders nothing when not open", () => {
    const { container } = render(<CommandPalette />);
    expect(container.firstChild).toBeNull();
  });

  it("opens when ⌘K is pressed", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByPlaceholderText("Search or jump to…")).toBeInTheDocument();
  });

  it("opens when Ctrl+K is pressed", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByPlaceholderText("Search or jump to…")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByPlaceholderText("Search or jump to…")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Search or jump to…")).not.toBeInTheDocument();
  });

  it("shows action shortcuts when opened with no query", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    // Should show some action labels
    expect(screen.getByText("Receive goods")).toBeInTheDocument();
    expect(screen.getByText("Create indent")).toBeInTheDocument();
  });

  it("filters results when typing a query", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    const input = screen.getByPlaceholderText("Search or jump to…");
    await user.type(input, "receive");
    expect(screen.getByText("Receive goods")).toBeInTheDocument();
  });

  it("shows ESC kbd hint", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByText("ESC")).toBeInTheDocument();
  });

  it("shows navigation hints at the bottom", async () => {
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByText("to navigate")).toBeInTheDocument();
    expect(screen.getByText("to select")).toBeInTheDocument();
  });

  it("shows no results message for unmatched query", async () => {
    // Mock fetch so the entity search doesn't hang in entityLoading state.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ materials: [], projects: [], customers: [], suppliers: [] }),
    } as Response);
    const { user } = render(<CommandPalette />);
    await user.keyboard("{Meta>}k{/Meta}");
    const input = screen.getByPlaceholderText("Search or jump to…");
    await user.type(input, "zzzzzzzzz");
    // Wait for the debounce (350ms) + fetch to settle, then "No results" appears.
    expect(await screen.findByText("No results", undefined, { timeout: 3000 })).toBeInTheDocument();
  });
});

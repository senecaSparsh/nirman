// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { HsnSacSearch } from "./hsn-sac-search";

describe("HsnSacSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an input with the placeholder", () => {
    render(<HsnSacSearch value="" onCodeChange={vi.fn()} placeholder="Search code…" />);
    expect(screen.getByPlaceholderText("Search code…")).toBeInTheDocument();
  });

  it("renders with default placeholder", () => {
    render(<HsnSacSearch value="" onCodeChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search HSN/SAC code…")).toBeInTheDocument();
  });

  it("displays the initial value", () => {
    render(<HsnSacSearch value="9983" onCodeChange={vi.fn()} />);
    expect(screen.getByDisplayValue("9983")).toBeInTheDocument();
  });

  it("calls onCodeChange when typing", async () => {
    const onCodeChange = vi.fn();
    const { user } = render(<HsnSacSearch value="" onCodeChange={onCodeChange} />);
    await user.type(screen.getByDisplayValue(""), "A");
    expect(onCodeChange).toHaveBeenCalled();
  });

  it("does not show dropdown initially", () => {
    render(<HsnSacSearch value="" onCodeChange={vi.fn()} />);
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("fetches results when typing 2+ characters", async () => {
    const mockResults = {
      results: [
        { code: "9983", description: "Architectural services", gstRate: 18, type: "SAC" },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);
    const { user } = render(<HsnSacSearch value="" onCodeChange={vi.fn()} />);
    await user.type(screen.getByDisplayValue(""), "99");
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/hsn-sac/search"));
    });
    fetchSpy.mockRestore();
  });

  it("calls onCodeChange and onGstRateChange when a result is selected", async () => {
    const onCodeChange = vi.fn();
    const onGstRateChange = vi.fn();
    const mockResults = {
      results: [
        { code: "9983", description: "Architectural services", gstRate: 18, type: "SAC" },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);
    const { user } = render(
      <HsnSacSearch value="" onCodeChange={onCodeChange} onGstRateChange={onGstRateChange} />,
    );
    await user.type(screen.getByDisplayValue(""), "99");
    await waitFor(() => {
      expect(screen.getByText("9983")).toBeInTheDocument();
    });
    await user.click(screen.getByText("9983"));
    expect(onCodeChange).toHaveBeenCalledWith("9983");
    expect(onGstRateChange).toHaveBeenCalledWith(18);
  });
});

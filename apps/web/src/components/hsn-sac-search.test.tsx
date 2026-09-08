// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@/test/render";
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
    expect(screen.getByPlaceholderText("Search or type HSN/SAC code…")).toBeInTheDocument();
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

  it("fetches results from the DB-backed /api/hsn-gst endpoint", async () => {
    const mockResults = [
      { hsnCode: "9983", description: "Engineering services", gstRate: 18, sacCode: "9983", category: "Services" },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);
    const { user } = render(<HsnSacSearch value="" onCodeChange={vi.fn()} />);
    await user.type(screen.getByDisplayValue(""), "99");
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/hsn-gst"));
    });
    fetchSpy.mockRestore();
  });

  it("calls onCodeChange and onGstRateChange when a result is selected", async () => {
    const onCodeChange = vi.fn();
    const onGstRateChange = vi.fn();
    const mockResults = [
      { hsnCode: "9983", description: "Engineering services", gstRate: 18, sacCode: "9983", category: "Services" },
    ];
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

  // ── Smart auto-detect tests ──

  it("auto-suggests HSN code from materialName (suggest endpoint)", async () => {
    const onCodeChange = vi.fn();
    const onGstRateChange = vi.fn();
    const suggestResults = [
      { hsnCode: "2523", description: "Portland cement", gstRate: 18, sacCode: null, category: "Goods" },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("suggest=")) {
        return { ok: true, json: async () => suggestResults } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    });
    render(
      <HsnSacSearch
        value=""
        onCodeChange={onCodeChange}
        onGstRateChange={onGstRateChange}
        materialName="Portland Cement"
        categoryName="Cement"
      />,
    );
    // Wait for the debounced suggest call (600ms)
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("suggest=Portland+Cement"));
    }, { timeout: 2000 });
    // The auto-fill happens after the response
    await waitFor(() => {
      expect(onCodeChange).toHaveBeenCalledWith("2523");
      expect(onGstRateChange).toHaveBeenCalledWith(18);
    }, { timeout: 2000 });
    fetchSpy.mockRestore();
  });

  it("does not auto-suggest when user has manually typed an HSN code", async () => {
    const onCodeChange = vi.fn();
    const suggestResults = [
      { hsnCode: "2523", description: "Portland cement", gstRate: 18, sacCode: null, category: "Goods" },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("suggest=")) {
        return { ok: true, json: async () => suggestResults } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    });
    const { user } = render(
      <HsnSacSearch
        value=""
        onCodeChange={onCodeChange}
        materialName="Portland Cement"
      />,
    );
    // User types manually first — this sets manuallySet=true
    await user.type(screen.getByDisplayValue(""), "7308");
    // Wait past the suggest debounce to ensure no suggest call fires
    await new Promise((r) => setTimeout(r, 800));
    // The suggest endpoint should NOT have been called because manuallySet is true
    const suggestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes("suggest="),
    );
    expect(suggestCalls.length).toBe(0);
    // onCodeChange should not have been called with the suggested code
    expect(onCodeChange).not.toHaveBeenCalledWith("2523");
    fetchSpy.mockRestore();
  });

  it("auto-looks up GST rate when HSN code is entered", async () => {
    const onGstRateChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("hsn=")) {
        return {
          ok: true,
          json: async () => ({ hsnCode: "2523", gstRate: 18, description: "Cement", sacCode: null, category: "Goods" }),
        } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    });
    render(
      <HsnSacSearch
        value="2523"
        onCodeChange={vi.fn()}
        onGstRateChange={onGstRateChange}
      />,
    );
    await waitFor(() => {
      expect(onGstRateChange).toHaveBeenCalledWith(18);
    }, { timeout: 2000 });
    vi.restoreAllMocks();
  });
});

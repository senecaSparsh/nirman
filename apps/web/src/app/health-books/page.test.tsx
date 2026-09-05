// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@/test/render";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

// Mock runBookReconciliation from @nirman/services
const mockReport = {
  timestamp: new Date("2024-12-01T10:00:00Z"),
  allPass: true,
  summary: "All 5 checks passed",
  checks: [
    {
      id: "stock-gl",
      name: "Stock vs GL",
      description: "Stock value should match GL",
      status: "PASS" as const,
      expected: 100000,
      actual: 100000,
      delta: 0,
      tolerance: 1,
      message: "OK",
      details: [
        { id: "d1", label: "Warehouse A", expected: 50000, actual: 50000, delta: 0 },
      ],
    },
  ],
};
vi.mock("@nirman/services", () => ({
  runBookReconciliation: vi.fn(async () => mockReport),
}));

vi.mock("@/components/finance/books-health-view", () => ({
  BooksHealthView: (props: { timestamp: Date; allPass: boolean; summary: string; checks: unknown[] }) => (
    <div data-testid="books-health-view">
      <span data-testid="all-pass">{String(props.allPass)}</span>
      <span data-testid="checks-count">{props.checks.length}</span>
      <span data-testid="checks-json">{JSON.stringify(props.checks)}</span>
    </div>
  ),
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string }) => (
    <div data-testid="page-header"><h1>{props.title}</h1></div>
  ),
}));
vi.mock("@/components/page-loading", () => ({
  PageLoading: () => <div data-testid="page-loading">Loading…</div>,
}));

import { BooksHealthContent } from "./page";

describe("HealthBooksPage (BooksHealthContent)", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
  });

  it("renders the BooksHealthView with reconciliation report", async () => {
    const ui = await BooksHealthContent();
    render(ui);
    expect(screen.getByTestId("books-health-view")).toBeInTheDocument();
    expect(screen.getByTestId("all-pass")).toHaveTextContent("true");
    expect(screen.getByTestId("checks-count")).toHaveTextContent("1");
  });

  it("serializes check data with toNum conversions", async () => {
    const ui = await BooksHealthContent();
    render(ui);

    const checks = JSON.parse(screen.getByTestId("checks-json").textContent!);
    expect(checks[0].id).toBe("stock-gl");
    expect(checks[0].expected).toBe(100000);
    expect(checks[0].actual).toBe(100000);
    expect(checks[0].delta).toBe(0);
    expect(checks[0].details[0].label).toBe("Warehouse A");
  });

  it("shows NoAccess for a role without FINANCE_VIEW", async () => {
    // SITE_ENGINEER lacks FINANCE_VIEW
    setSessionUser({ role: "SITE_ENGINEER" });
    const ui = await BooksHealthContent();
    render(ui);
    expect(screen.queryByTestId("books-health-view")).not.toBeInTheDocument();
  });

  it("renders for FINANCE_HEAD role (has FINANCE_VIEW)", async () => {
    setSessionUser({ role: "FINANCE_HEAD" });
    const ui = await BooksHealthContent();
    render(ui);
    expect(screen.getByTestId("books-health-view")).toBeInTheDocument();
  });
});

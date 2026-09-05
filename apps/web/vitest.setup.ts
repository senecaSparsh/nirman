import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// ── RTL cleanup after each jsdom test (no-op in node env) ──────────────────
afterEach(() => {
  cleanup();
});

// ── Polyfills that jsdom doesn't ship ──────────────────────────────────────
// IntersectionObserver (used by some lazy-render components).
if (typeof globalThis.IntersectionObserver === "undefined") {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = IO as unknown as typeof IntersectionObserver;
}

// ResizeObserver (used by resizable.tsx).
if (typeof globalThis.ResizeObserver === "undefined") {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
}

// matchMedia (used by some hooks for prefers-color-scheme etc.).
if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// scrollTo / scrollIntoView — jsdom doesn't implement layout.
if (typeof globalThis.scrollTo !== "function") {
  globalThis.scrollTo = () => {};
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ── Default mocks for next/* primitives ────────────────────────────────────
// These are auto-applied to every test via vi.mock at the global level.
// Individual tests can override with their own vi.mock() call.

// next/headers — cookies/headers stubs return empty containers by default.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
    getAll: () => [],
  })),
  headers: vi.fn(async () => new Headers()),
}));

// next/cache — revalidatePath/revalidateTag are no-ops in tests.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// next/navigation — useRouter backed by next-router-mock for jsdom tests.
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    redirect: vi.fn((url: string) => {
      // Server-side redirect throws NEXT_REDIRECT; tests that exercise server
      // components should assert on the thrown error's `digest` field.
      const err = new Error(`NEXT_REDIRECT: ${url}`);
      (err as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};302`;
      throw err;
    }),
    notFound: vi.fn(() => {
      const err = new Error("NEXT_NOT_FOUND");
      (err as { digest?: string }).digest = "NEXT_NOT_FOUND";
      throw err;
    }),
  };
});

// next/server — connection() is a no-op (marks route dynamic).
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    connection: vi.fn(),
  };
});

// ── Silence console.error from React's act() warnings during intentional ──
// error-path tests. Restore per-test with vi.restoreAllMocks() if needed.
// (Left off by default — uncomment if noise becomes a problem.)

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

// next/navigation is already mocked in vitest.setup.ts — redirect throws a
// NEXT_REDIRECT error whose digest encodes the destination URL.
import CustomersPage from "./page";

describe("CustomersPage (redirect)", () => {
  it("redirects to /sales?tab=customers", () => {
    expect(() => CustomersPage()).toThrow("NEXT_REDIRECT: /sales?tab=customers");
  });

  it("throws an error with NEXT_REDIRECT digest", () => {
    try {
      CustomersPage();
    } catch (err) {
      expect((err as Error & { digest?: string }).digest).toContain("NEXT_REDIRECT");
      expect((err as Error & { digest?: string }).digest).toContain("/sales");
    }
  });
});

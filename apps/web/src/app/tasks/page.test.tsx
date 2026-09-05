// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

// next/navigation is already mocked in vitest.setup.ts — redirect throws a
// NEXT_REDIRECT error whose digest encodes the destination URL.
import TasksPage from "./page";

describe("TasksPage (redirect)", () => {
  it("redirects to /my-tasks", () => {
    expect(() => TasksPage()).toThrow("NEXT_REDIRECT: /my-tasks");
  });

  it("throws an error with NEXT_REDIRECT digest", () => {
    try {
      TasksPage();
    } catch (err) {
      expect((err as Error & { digest?: string }).digest).toContain("NEXT_REDIRECT");
      expect((err as Error & { digest?: string }).digest).toContain("/my-tasks");
    }
  });
});

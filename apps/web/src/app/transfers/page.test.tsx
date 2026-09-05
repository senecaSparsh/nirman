import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT: ${url}`);
    (err as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};302`;
    throw err;
  }),
  notFound: vi.fn(() => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  }),
}));

import { redirect } from "next/navigation";
import TransfersPage from "./page";

describe("TransfersPage (redirect)", () => {
  it("redirects to /stock?tab=transfers", () => {
    expect(() => TransfersPage()).toThrow();
    expect(redirect).toHaveBeenCalledWith("/stock?tab=transfers");
  });
});

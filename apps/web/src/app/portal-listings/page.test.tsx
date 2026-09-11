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
import PortalListingsPage from "./page";

describe("PortalListingsPage (redirect)", () => {
  it("redirects to /units", () => {
    expect(() => PortalListingsPage()).toThrow();
    expect(redirect).toHaveBeenCalledWith("/units?tab=portal");
  });
});

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
import RentRedirect from "./page";

describe("RentPage (redirect)", () => {
  it("redirects to /rentals", () => {
    expect(() => RentRedirect()).toThrow();
    expect(redirect).toHaveBeenCalledWith("/rentals");
  });
});

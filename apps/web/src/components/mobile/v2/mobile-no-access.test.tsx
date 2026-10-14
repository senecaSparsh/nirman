// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("@/components/page", () => ({ statusMeaning: () => ({ label: "", tone: "neutral" }) }));

import { MobileNoAccess } from "./primitives";

describe("MobileNoAccess", () => {
  it("names the permission in plain words, not the raw key", () => {
    render(<MobileNoAccess what="submit DPRs" permission="dpr.submit" />);
    expect(screen.getByText("DPR Submit")).toBeInTheDocument();
    expect(screen.queryByText("dpr.submit")).not.toBeInTheDocument();
  });
});

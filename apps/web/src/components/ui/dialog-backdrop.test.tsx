// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { Dialog } from "./dialog";

describe("Dialog backdrop click", () => {
  it("calls onOpenChange(false) when backdrop is clicked", async () => {
    const onOpenChange = vi.fn();
    const { user } = render(
      <Dialog open onOpenChange={onOpenChange} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    // Dialog portals to document.body — the render `container` never holds it.
    const backdrop = document.querySelector(".drawer-backdrop") as HTMLElement;
    await user.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

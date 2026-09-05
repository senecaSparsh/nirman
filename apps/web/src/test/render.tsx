/**
 * Custom render for React component tests (jsdom environment).
 *
 * Usage:
 * ```ts
 * // @vitest-environment jsdom
 * import { describe, it, expect } from "vitest";
 * import { render, screen } from "@/test/render";
 * import { MyComponent } from "./my-component";
 *
 * describe("MyComponent", () => {
 *   it("renders the title", () => {
 *     render(<MyComponent title="Hello" />);
 *     expect(screen.getByText("Hello")).toBeInTheDocument();
 *   });
 * });
 * ```
 *
 * The custom render wraps the tree in any providers the app's components
 * expect (toast sonner <Toaster>, etc.) and applies userEvent setup.
 */
import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { type ReactNode } from "react";

export interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Extra providers to wrap around the rendered component. */
  wrapper?: (children: ReactNode) => ReactNode;
}

export interface CustomRenderResult extends RenderResult {
  user: UserEvent;
}

export function render(ui: ReactNode, options: CustomRenderOptions = {}): CustomRenderResult {
  const { wrapper, ...rest } = options;

  const tree = wrapper ? wrapper(ui) : ui;

  const result = rtlRender(<>{tree}</>, { ...rest });
  return {
    ...result,
    user: userEvent.setup(),
  };
}

export { screen, within, waitFor, waitForElementToBeRemoved, act } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

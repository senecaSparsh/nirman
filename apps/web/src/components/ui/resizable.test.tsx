// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable";

describe("Resizable", () => {
  it("renders panel group with children", () => {
    render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel>Left</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>,
    );
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("renders handle between panels", () => {
    const { container } = render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel>Left</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>,
    );
    // The handle should render with a grip span
    const grip = container.querySelector(".bg-muted-foreground\\/30");
    expect(grip).not.toBeNull();
  });

  it("applies custom className to panel group", () => {
    const { container } = render(
      <ResizablePanelGroup className="custom-class" orientation="horizontal">
        <ResizablePanel>Content</ResizablePanel>
      </ResizablePanelGroup>,
    );
    const group = container.firstChild as HTMLElement;
    expect(group.className).toContain("custom-class");
  });

  it("renders panel with custom className", () => {
    const { container } = render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel className="my-panel">Content</ResizablePanel>
      </ResizablePanelGroup>,
    );
    const panel = container.querySelector(".my-panel") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("Content");
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { PipelineStepper, type PipelineStep } from "./pipeline-stepper";

describe("PipelineStepper", () => {
  it("renders nothing when steps array is empty", () => {
    const { container } = render(<PipelineStepper steps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders all step labels", () => {
    const steps: PipelineStep[] = [
      { label: "Indent", state: "done" },
      { label: "Quote", state: "current" },
      { label: "PO", state: "pending" },
    ];
    render(<PipelineStepper steps={steps} />);
    expect(screen.getByText("Indent")).toBeInTheDocument();
    expect(screen.getByText("Quote")).toBeInTheDocument();
    expect(screen.getByText("PO")).toBeInTheDocument();
  });

  it("renders a nav element with aria-label", () => {
    const steps: PipelineStep[] = [{ label: "Step 1", state: "done" }];
    render(<PipelineStepper steps={steps} />);
    expect(screen.getByRole("navigation")).toHaveAttribute("aria-label", "Pipeline position");
  });

  it("renders a link when href is provided and state is not pending", () => {
    const steps: PipelineStep[] = [
      { label: "Indent", state: "done", href: "/indent/1" },
    ];
    render(<PipelineStepper steps={steps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/indent/1");
    expect(link).toHaveAttribute("title", "Indent");
  });

  it("does not render a link when state is pending even with href", () => {
    const steps: PipelineStep[] = [
      { label: "PO", state: "pending", href: "/po/1" },
    ];
    render(<PipelineStepper steps={steps} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders done state with filled dot", () => {
    const steps: PipelineStep[] = [{ label: "Done", state: "done" }];
    const { container } = render(<PipelineStepper steps={steps} />);
    const dot = container.querySelector(".border-foreground");
    expect(dot).not.toBeNull();
  });

  it("renders current state with brand dot", () => {
    const steps: PipelineStep[] = [{ label: "Current", state: "current" }];
    const { container } = render(<PipelineStepper steps={steps} />);
    const dot = container.querySelector(".border-brand");
    expect(dot).not.toBeNull();
  });

  it("renders pending state with hollow dot", () => {
    const steps: PipelineStep[] = [{ label: "Pending", state: "pending" }];
    const { container } = render(<PipelineStepper steps={steps} />);
    const dot = container.querySelector(".bg-transparent");
    expect(dot).not.toBeNull();
  });

  it("renders skipped state with dashed border", () => {
    const steps: PipelineStep[] = [{ label: "Skipped", state: "skipped" }];
    const { container } = render(<PipelineStepper steps={steps} />);
    const dot = container.querySelector(".border-dashed");
    expect(dot).not.toBeNull();
  });
});

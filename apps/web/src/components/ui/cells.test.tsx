// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { IdentityCell, ProgressCell, MoneyCell, QtyCell, DateCell } from "./cells";

describe("IdentityCell", () => {
  it("renders the name", () => {
    render(<IdentityCell name="Cement OPC 53" />);
    expect(screen.getByText("Cement OPC 53")).toBeInTheDocument();
  });

  it("renders the sub text when provided", () => {
    render(<IdentityCell name="Cement" sub="Code: CEM-001" />);
    expect(screen.getByText("Code: CEM-001")).toBeInTheDocument();
  });

  it("renders a dot when dot prop is provided", () => {
    const { container } = render(<IdentityCell name="Cement" dot="#ef4444" />);
    const dot = container.querySelector('[aria-hidden]');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("style")).toContain("background-color");
  });

  it("renders an icon when icon prop is provided", () => {
    render(<IdentityCell name="Cement" icon={<span data-testid="ico">📦</span>} />);
    expect(screen.getByTestId("ico")).toBeInTheDocument();
  });

  it("wraps in a Link when href is provided", () => {
    render(<IdentityCell name="Cement" href="/materials/1" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/materials/1");
    expect(screen.getByText("Cement")).toBeInTheDocument();
  });

  it("does not wrap in a Link when href is not provided", () => {
    render(<IdentityCell name="Cement" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("ProgressCell", () => {
  it("renders a dash when total is 0", () => {
    render(<ProgressCell value={5} total={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the percentage", () => {
    render(<ProgressCell value={50} total={100} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders the label when provided", () => {
    render(<ProgressCell value={50} total={100} label="₹4.2L / ₹6L" />);
    expect(screen.getByText("₹4.2L / ₹6L")).toBeInTheDocument();
  });

  it("renders a progress bar", () => {
    const { container } = render(<ProgressCell value={50} total={100} />);
    const bar = container.querySelector(".h-1");
    expect(bar).not.toBeNull();
  });

  it("caps the bar width at 100%", () => {
    const { container } = render(<ProgressCell value={150} total={100} />);
    const fill = container.querySelector(".h-full");
    expect(fill?.getAttribute("style")).toContain("width: 100%");
  });
});

describe("MoneyCell", () => {
  it("renders the formatted amount", () => {
    render(<MoneyCell value={1000} formatted="₹1,000" />);
    expect(screen.getByText("₹1,000")).toBeInTheDocument();
  });

  it("renders sub text when provided", () => {
    render(<MoneyCell value={1000} formatted="₹1,000" sub="Margin: 10%" />);
    expect(screen.getByText("Margin: 10%")).toBeInTheDocument();
  });

  it("applies success tone for positive values", () => {
    const { container } = render(<MoneyCell value={100} formatted="₹100" />);
    const span = container.querySelector(".font-semibold");
    expect(span?.className).toContain("text-success");
  });

  it("applies danger tone for negative values", () => {
    const { container } = render(<MoneyCell value={-100} formatted="-₹100" />);
    const span = container.querySelector(".font-semibold");
    expect(span?.className).toContain("text-danger");
  });

  it("applies neutral tone when neutral is true", () => {
    const { container } = render(<MoneyCell value={100} formatted="₹100" neutral />);
    const span = container.querySelector(".font-semibold");
    expect(span?.className).toContain("text-foreground");
  });

  it("shows + sign when showSign is true and value is positive", () => {
    render(<MoneyCell value={100} formatted="₹100" showSign />);
    expect(screen.getByText("+₹100")).toBeInTheDocument();
  });
});

describe("QtyCell", () => {
  it("renders the value", () => {
    render(<QtyCell value={50} />);
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("renders the unit when provided", () => {
    render(<QtyCell value={50} unit="kg" />);
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("renders sub text when provided", () => {
    render(<QtyCell value={50} sub="Reserved: 10" />);
    expect(screen.getByText("Reserved: 10")).toBeInTheDocument();
  });

  it("applies danger tone", () => {
    const { container } = render(<QtyCell value={5} tone="danger" />);
    const span = container.querySelector(".font-semibold");
    expect(span?.className).toContain("text-danger");
  });

  it("applies warning tone", () => {
    const { container } = render(<QtyCell value={5} tone="warning" />);
    const span = container.querySelector(".font-semibold");
    expect(span?.className).toContain("text-warning");
  });

  it("applies success tone", () => {
    const { container } = render(<QtyCell value={50} tone="success" />);
    const span = container.querySelector(".font-semibold");
    expect(span?.className).toContain("text-success");
  });
});

describe("DateCell", () => {
  it("renders a dash when date is null", () => {
    render(<DateCell date={null} formatted="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a dash when date is undefined", () => {
    render(<DateCell date={undefined} formatted="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the formatted date", () => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    render(<DateCell date={date} formatted="30 Mar" />);
    expect(screen.getByText("30 Mar")).toBeInTheDocument();
  });

  it("renders 'today' for today's date", () => {
    render(<DateCell date={new Date()} formatted="Today" />);
    expect(screen.getByText("today")).toBeInTheDocument();
  });

  it("renders relative time for future dates", () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    render(<DateCell date={date} formatted="Future" />);
    expect(screen.getByText("in 3d")).toBeInTheDocument();
  });

  it("renders relative time for past dates", () => {
    const date = new Date();
    date.setDate(date.getDate() - 5);
    render(<DateCell date={date} formatted="Past" />);
    expect(screen.getByText("5d ago")).toBeInTheDocument();
  });

  it("accepts a string date", () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    render(<DateCell date={date.toISOString()} formatted="Tomorrow" />);
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });
});

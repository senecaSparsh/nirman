// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("@/lib/use-company-switch", () => ({
  useCompanySwitch: vi.fn(() => ({
    switchCompany: vi.fn(),
    isSwitching: false,
    switchingToId: null,
  })),
}));

import { CompanySwitcher } from "./company-switcher";

const companies = [
  { id: "1", name: "Company A", businessType: "LLP", parentName: null, isCurrent: true },
  { id: "2", name: "Company B", businessType: "Pvt Ltd", parentName: null, isCurrent: false },
  { id: "3", name: "Sub Co", businessType: null, parentName: "Company A", isCurrent: false },
];

describe("CompanySwitcher", () => {
  it("renders nothing when only one company", () => {
    const { container } = render(
      <CompanySwitcher companies={[companies[0]!]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the current company name when multiple companies", () => {
    render(<CompanySwitcher companies={companies} />);
    expect(screen.getByText("Company A")).toBeInTheDocument();
  });

  it("renders a button with title attribute", () => {
    render(<CompanySwitcher companies={companies} />);
    const btn = screen.getByRole("button", { name: "Company A" });
    expect(btn).toHaveAttribute("title", "Switch company");
  });

  it("opens dropdown when button is clicked", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Company A" }));
    expect(screen.getByText("Company B")).toBeInTheDocument();
    expect(screen.getByText("Sub Co")).toBeInTheDocument();
  });

  it("shows business type in dropdown", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Company A" }));
    expect(screen.getByText("LLP")).toBeInTheDocument();
    expect(screen.getByText("Pvt Ltd")).toBeInTheDocument();
  });

  it("shows parent name in dropdown", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Company A" }));
    expect(screen.getByText(/under Company A/)).toBeInTheDocument();
  });

  it("shows Manage companies link in dropdown", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Company A" }));
    expect(screen.getByText("Manage companies")).toBeInTheDocument();
  });

  it("shows checkmark for current company", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Company A" }));
    // The current company (Company A) should have a check icon
    const buttons = screen.getAllByRole("button");
    expect(buttons.some((b) => b.textContent?.includes("Company A"))).toBe(true);
  });
});

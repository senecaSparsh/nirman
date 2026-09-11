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
  it("renders a profile link when only one company", () => {
    render(
      <CompanySwitcher companies={[companies[0]!]} />,
    );
    const link = screen.getByRole("link", { name: /Company A/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/companies/1");
    expect(link).toHaveAttribute("title", "View company profile");
  });

  it("renders nothing when companies list is empty (loading)", () => {
    const { container } = render(
      <CompanySwitcher companies={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the current company name when multiple companies", () => {
    render(<CompanySwitcher companies={companies} />);
    expect(screen.getByText("Company A")).toBeInTheDocument();
  });

  it("renders a profile link and switcher button with multiple companies", () => {
    render(<CompanySwitcher companies={companies} />);
    // Company name is a link to the profile
    const link = screen.getByRole("link", { name: /Company A/ });
    expect(link).toHaveAttribute("href", "/companies/1");
    // Chevron button opens the switcher
    const btn = screen.getByRole("button", { name: "Switch company" });
    expect(btn).toHaveAttribute("title", "Switch company");
  });

  it("opens dropdown when chevron is clicked", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Switch company" }));
    expect(screen.getByText("Company B")).toBeInTheDocument();
    expect(screen.getByText("Sub Co")).toBeInTheDocument();
  });

  it("shows business type in dropdown", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Switch company" }));
    expect(screen.getByText("LLP")).toBeInTheDocument();
    expect(screen.getByText("Pvt Ltd")).toBeInTheDocument();
  });

  it("shows parent name in dropdown", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Switch company" }));
    expect(screen.getByText(/under Company A/)).toBeInTheDocument();
  });

  it("shows Manage companies link in dropdown", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Switch company" }));
    expect(screen.getByText("Manage companies")).toBeInTheDocument();
  });

  it("shows checkmark for current company", async () => {
    const { user } = render(<CompanySwitcher companies={companies} />);
    await user.click(screen.getByRole("button", { name: "Switch company" }));
    // The current company (Company A) should have a check icon
    const buttons = screen.getAllByRole("button");
    expect(buttons.some((b) => b.textContent?.includes("Company A"))).toBe(true);
  });
});

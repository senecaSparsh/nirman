// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { PageHeader, SubNav } from "./page-header";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Materials" />);
    expect(screen.getByText("Materials")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<PageHeader title="Materials" description="Manage your material catalog" />);
    expect(screen.getByText("Manage your material catalog")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <PageHeader title="Materials" action={<button>Add Material</button>} />,
    );
    expect(screen.getByRole("button", { name: "Add Material" })).toBeInTheDocument();
  });

  it("renders secondary actions before primary action", () => {
    render(
      <PageHeader
        title="Materials"
        action={<button>Primary</button>}
        secondaryActions={<button>Secondary</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secondary" })).toBeInTheDocument();
  });

  it("renders stats when provided", () => {
    render(
      <PageHeader
        title="Materials"
        stats={[
          { label: "Total", value: 42 },
          { label: "Low Stock", value: 5, tone: "warning" },
        ]}
      />,
    );
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Low Stock")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders breadcrumbs when provided", () => {
    render(
      <PageHeader
        title="Materials"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Materials" },
        ]}
      />,
    );
    expect(screen.getByText("Home")).toBeInTheDocument();
    // "Materials" appears in both the breadcrumb and the title — use getAllByText.
    expect(screen.getAllByText("Materials")).toHaveLength(2);
  });

  it("renders breadcrumb links for non-last items", () => {
    render(
      <PageHeader
        title="Materials"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Materials" },
        ]}
      />,
    );
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("does not render breadcrumb nav when breadcrumbs is empty", () => {
    render(<PageHeader title="Materials" breadcrumbs={[]} />);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });

  it("renders stat hint tooltip when provided", () => {
    const { container } = render(
      <PageHeader
        title="Materials"
        stats={[{ label: "Total", value: 42, hint: "Total materials in catalog" }]}
      />,
    );
    expect(container.textContent).toContain("Total materials in catalog");
  });
});

describe("SubNav", () => {
  it("renders nav items as links", () => {
    render(
      <SubNav
        items={[
          { label: "On Hand", href: "/stock" },
          { label: "Movements", href: "/stock/movements" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "On Hand" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Movements" })).toBeInTheDocument();
  });

  it("marks active item with aria-current", () => {
    render(
      <SubNav
        items={[
          { label: "On Hand", href: "/stock", active: true },
          { label: "Movements", href: "/stock/movements" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "On Hand" })).toHaveAttribute("aria-current", "page");
  });

  it("renders count badge when count > 0", () => {
    render(
      <SubNav
        items={[
          { label: "Approvals", href: "/approvals", count: 5 },
        ]}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not render count badge when count is 0", () => {
    render(
      <SubNav
        items={[
          { label: "Approvals", href: "/approvals", count: 0 },
        ]}
      />,
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders 99+ when count exceeds 99", () => {
    render(
      <SubNav
        items={[
          { label: "Items", href: "/items", count: 200 },
        ]}
      />,
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });
});

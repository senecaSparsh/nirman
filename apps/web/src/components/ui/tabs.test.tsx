// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { Tabs, TabsList, TabsTrigger, TabsContent, Segmented } from "./tabs";

describe("Tabs", () => {
  it("renders the active tab content by default with defaultValue", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Content A")).toBeInTheDocument();
    expect(screen.queryByText("Content B")).not.toBeInTheDocument();
  });

  it("switches content when a tab is clicked (controlled)", async () => {
    const onChange = vi.fn();
    const { user } = render(
      <Tabs value="a" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Content A")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("switches content when a tab is clicked (uncontrolled)", async () => {
    const { user } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Content A")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(screen.getByText("Content B")).toBeInTheDocument();
    expect(screen.queryByText("Content A")).not.toBeInTheDocument();
  });

  it("marks the active tab with aria-selected", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute("aria-selected", "false");
  });

  it("renders count badge when count is provided and > 0", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" count={5}>Tab A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not render count badge when count is 0", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" count={0}>Tab A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders 99+ when count exceeds 99", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" count={200}>Tab A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders tablist role", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});

describe("Segmented", () => {
  it("renders all options", () => {
    render(
      <Segmented
        value="a"
        onChange={vi.fn()}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("marks the active option with aria-pressed", () => {
    render(
      <Segmented
        value="b"
        onChange={vi.fn()}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    );
    expect(screen.getByText("Beta")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Alpha")).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange when an option is clicked", async () => {
    const onChange = vi.fn();
    const { user } = render(
      <Segmented
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    );
    await user.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("hides label text and uses title when iconOnly is true", () => {
    render(
      <Segmented
        value="a"
        onChange={vi.fn()}
        iconOnly
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    );
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByTitle("Alpha")).toBeInTheDocument();
  });
});

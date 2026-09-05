// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { DataTable, type Column } from "./data-table";

interface Row {
  id: string;
  name: string;
  qty: number;
  price: number;
}

const columns: Column<Row>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "qty", label: "Qty", align: "right", sortable: true },
  { key: "price", label: "Price", align: "right", sortable: true },
];

const data: Row[] = [
  { id: "1", name: "Alpha", qty: 10, price: 100 },
  { id: "2", name: "Beta", qty: 5, price: 200 },
  { id: "3", name: "Gamma", qty: 20, price: 50 },
];

describe("DataTable", () => {
  it("renders column headers", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
  });

  it("renders all rows", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders emptyState when data is empty", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<div>No data available</div>}
      />,
    );
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const { user } = render(
      <DataTable columns={columns} data={data} onRowClick={onRowClick} />,
    );
    await user.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it("sorts rows when a sortable column header is clicked", async () => {
    const { user } = render(
      <DataTable columns={columns} data={data} />,
    );
    // Click "Qty" header to sort ascending
    await user.click(screen.getByText("Qty"));
    const cells = screen.getAllByText(/Alpha|Beta|Gamma/);
    // Ascending: Beta(5), Alpha(10), Gamma(20)
    expect(cells[0]).toHaveTextContent("Beta");
    expect(cells[1]).toHaveTextContent("Alpha");
    expect(cells[2]).toHaveTextContent("Gamma");
  });

  it("toggles sort direction on second click", async () => {
    const { user } = render(
      <DataTable columns={columns} data={data} />,
    );
    await user.click(screen.getByText("Qty"));
    await user.click(screen.getByText("Qty"));
    const cells = screen.getAllByText(/Alpha|Beta|Gamma/);
    // Descending: Gamma(20), Alpha(10), Beta(5)
    expect(cells[0]).toHaveTextContent("Gamma");
    expect(cells[2]).toHaveTextContent("Beta");
  });

  it("filters rows when searchable and text is entered", async () => {
    const { user } = render(
      <DataTable columns={columns} data={data} searchable searchPlaceholder="Search…" />,
    );
    const search = screen.getByPlaceholderText("Search…");
    await user.type(search, "Alpha");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
  });

  it("renders a search input when searchable is true", () => {
    render(
      <DataTable columns={columns} data={data} searchable searchPlaceholder="Find…" />,
    );
    expect(screen.getByPlaceholderText("Find…")).toBeInTheDocument();
  });

  it("does not render a search input when searchable is false", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("renders custom cell content via render function", () => {
    const customColumns: Column<Row>[] = [
      { key: "name", label: "Name", render: (row) => <strong>{row.name}!</strong> },
      { key: "qty", label: "Qty", align: "right" },
    ];
    render(<DataTable columns={customColumns} data={data} />);
    expect(screen.getByText("Alpha!")).toBeInTheDocument();
  });

  it("paginates when pageSize is set", async () => {
    const bigData: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 1),
      name: `Item ${i + 1}`,
      qty: i + 1,
      price: i * 10,
    }));
    render(<DataTable columns={columns} data={bigData} pageSize={2} />);
    // Page 1: Item 1, Item 2
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
  });

  it("shows totals row when showTotals is true", () => {
    render(<DataTable columns={columns} data={data} showTotals />);
    // Total qty = 35, total price = 350
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("350")).toBeInTheDocument();
  });

  it("renders toolbar when searchable is true", () => {
    render(<DataTable columns={columns} data={data} searchable />);
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  it("hides toolbar when hideToolbar is true", () => {
    render(
      <DataTable columns={columns} data={data} searchable hideToolbar />,
    );
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });
});

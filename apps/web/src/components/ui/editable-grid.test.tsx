// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";
import { EditableGrid, type EditableColumn } from "./editable-grid";

interface Row extends Record<string, unknown> {
  name: string;
  qty: number;
  rate: number;
  amount?: number;
}

const columns: EditableColumn<Row>[] = [
  { key: "name", label: "Name", type: "text", placeholder: "Enter name" },
  { key: "qty", label: "Qty", type: "number", align: "right" },
  { key: "rate", label: "Rate", type: "number", align: "right" },
  {
    key: "amount",
    label: "Amount",
    type: "computed",
    compute: (r) => (r.qty ?? 0) * (r.rate ?? 0),
    align: "right",
  },
];

describe("EditableGrid", () => {
  it("renders column headers", () => {
    render(<EditableGrid columns={columns} rows={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Rate")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("renders empty state when rows is empty and emptyState is provided", () => {
    render(
      <EditableGrid
        columns={columns}
        rows={[]}
        onChange={vi.fn()}
        emptyState={<div>No items yet</div>}
      />,
    );
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });

  it("renders row data", () => {
    const rows: Row[] = [
      { name: "Cement", qty: 10, rate: 50 },
      { name: "Sand", qty: 5, rate: 30 },
    ];
    render(<EditableGrid columns={columns} rows={rows} onChange={vi.fn()} />);
    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("Sand")).toBeInTheDocument();
  });

  it("computes computed columns", () => {
    const rows: Row[] = [{ name: "Cement", qty: 10, rate: 50 }];
    render(<EditableGrid columns={columns} rows={rows} onChange={vi.fn()} />);
    // 10 * 50 = 500
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("shows totals row when showTotals is true", () => {
    const rows: Row[] = [
      { name: "Cement", qty: 10, rate: 50 },
      { name: "Sand", qty: 5, rate: 30 },
    ];
    render(
      <EditableGrid columns={columns} rows={rows} onChange={vi.fn()} showTotals />,
    );
    // Total qty = 15, total rate = 80
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("does not show totals row when showTotals is false", () => {
    const rows: Row[] = [{ name: "Cement", qty: 10, rate: 50 }];
    render(
      <EditableGrid columns={columns} rows={rows} onChange={vi.fn()} showTotals={false} />,
    );
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("renders select column with options", () => {
    const selectColumns: EditableColumn<Row>[] = [
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "a", label: "Category A" },
          { value: "b", label: "Category B" },
        ],
      },
      { key: "name", label: "Name", type: "text" },
    ];
    const rows: Row[] = [{ name: "Test", qty: 0, rate: 0, category: "a" } as Row];
    render(
      <EditableGrid columns={selectColumns} rows={rows} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Category A")).toBeInTheDocument();
    expect(screen.getByText("Category B")).toBeInTheDocument();
  });

  it("renders readonly column values", () => {
    const readonlyColumns: EditableColumn<Row>[] = [
      { key: "name", label: "Name", type: "readonly" },
      { key: "qty", label: "Qty", type: "number", align: "right" },
    ];
    const rows: Row[] = [{ name: "Readonly Item", qty: 5, rate: 10 } as Row];
    render(
      <EditableGrid columns={readonlyColumns} rows={rows} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Readonly Item")).toBeInTheDocument();
  });

  it("renders action buttons when actions are provided", () => {
    const onDelete = vi.fn();
    const rows: Row[] = [{ name: "Test", qty: 1, rate: 10 }];
    render(
      <EditableGrid
        columns={columns}
        rows={rows}
        onChange={vi.fn()}
        actions={[
          {
            icon: <span>D</span>,
            title: "Delete",
            onClick: onDelete,
          },
        ]}
      />,
    );
    expect(screen.getByTitle("Delete")).toBeInTheDocument();
  });

  it("calls onChange when a select cell value changes", () => {
    const onChange = vi.fn();
    const selectColumns: EditableColumn<Row>[] = [
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "a", label: "Cat A" },
          { value: "b", label: "Cat B" },
        ],
      },
      { key: "name", label: "Name", type: "text" },
    ];
    const rows: Row[] = [{ name: "Test", qty: 0, rate: 0, category: "a" } as Row];
    const { container } = render(
      <EditableGrid columns={selectColumns} rows={rows} onChange={onChange} />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
    const calledRows = onChange.mock.calls[0]![0] as Row[];
    expect(calledRows[0]!.category).toBe("b");
  });
});

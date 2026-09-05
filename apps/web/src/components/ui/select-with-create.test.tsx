// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { fireEvent } from "@testing-library/react";
import { SelectWithCreate, type SelectOption } from "./select-with-create";

const options: SelectOption[] = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

function renderDialog() {
  return ({ open, onCreated, onClose }: { open: boolean; onCreated: (e: { id: string; label?: string }) => void; onClose: (o: boolean) => void }) =>
    open ? (
      <div>
        <div data-testid="create-dialog">Create Dialog</div>
        <button onClick={() => onCreated({ id: "new-id", label: "New Item" })}>Create</button>
        <button onClick={() => onClose(false)}>Cancel</button>
      </div>
    ) : null;
}

describe("SelectWithCreate", () => {
  it("renders a select element with options", () => {
    render(
      <SelectWithCreate
        value=""
        onChange={vi.fn()}
        options={options}
        createLabel="item"
        renderCreateDialog={renderDialog()}
      />,
    );
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
    expect(screen.getByText("Option C")).toBeInTheDocument();
  });

  it("renders placeholder option", () => {
    render(
      <SelectWithCreate
        value=""
        onChange={vi.fn()}
        options={options}
        createLabel="item"
        placeholder="Choose…"
        renderCreateDialog={renderDialog()}
      />,
    );
    expect(screen.getByText("Choose…")).toBeInTheDocument();
  });

  it("renders the create new option", () => {
    render(
      <SelectWithCreate
        value=""
        onChange={vi.fn()}
        options={options}
        createLabel="supplier"
        renderCreateDialog={renderDialog()}
      />,
    );
    expect(screen.getByText("+ Create new supplier…")).toBeInTheDocument();
  });

  it("calls onChange when an option is selected", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SelectWithCreate
        value=""
        onChange={onChange}
        options={options}
        createLabel="item"
        renderCreateDialog={renderDialog()}
      />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("opens create dialog when sentinel is selected", () => {
    const { container } = render(
      <SelectWithCreate
        value=""
        onChange={vi.fn()}
        options={options}
        createLabel="item"
        renderCreateDialog={renderDialog()}
      />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__create_new__" } });
    expect(screen.getByTestId("create-dialog")).toBeInTheDocument();
  });

  it("auto-selects new entity when created", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SelectWithCreate
        value=""
        onChange={onChange}
        options={options}
        createLabel="item"
        renderCreateDialog={renderDialog()}
      />,
    );
    // Open the create dialog
    fireEvent.change(container.querySelector("select") as HTMLSelectElement, {
      target: { value: "__create_new__" },
    });
    // Click create
    fireEvent.click(screen.getByText("Create"));
    expect(onChange).toHaveBeenCalledWith("new-id");
  });

  it("renders grouped options", () => {
    const groups = [
      { label: "Group 1", options: [{ value: "x", label: "X" }] },
      { label: "Group 2", options: [{ value: "y", label: "Y" }] },
    ];
    const { container } = render(
      <SelectWithCreate
        value=""
        onChange={vi.fn()}
        groups={groups}
        createLabel="item"
        renderCreateDialog={renderDialog()}
      />,
    );
    const optgroups = container.querySelectorAll("optgroup");
    expect(optgroups).toHaveLength(2);
    expect(optgroups[0]).toHaveAttribute("label", "Group 1");
    expect(optgroups[1]).toHaveAttribute("label", "Group 2");
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <SelectWithCreate
        value=""
        onChange={vi.fn()}
        options={options}
        createLabel="item"
        disabled
        renderCreateDialog={renderDialog()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

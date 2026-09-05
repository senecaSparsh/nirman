// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { Input, Select, InputWithIcon, Label, Field, FormGrid, Fieldset } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input data-testid="i" />);
    expect(screen.getByTestId("i")).toBeInTheDocument();
    expect(screen.getByTestId("i").tagName).toBe("INPUT");
  });

  it("renders with placeholder", () => {
    render(<Input placeholder="Enter name" />);
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
  });

  it("supports different types", () => {
    render(<Input type="number" data-testid="i" />);
    expect(screen.getByTestId("i")).toHaveAttribute("type", "number");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input disabled data-testid="i" />);
    expect(screen.getByTestId("i")).toBeDisabled();
  });

  it("fires onChange when typed into", async () => {
    const onChange = vi.fn();
    const { user } = render(<Input onChange={onChange} data-testid="i" />);
    await user.type(screen.getByTestId("i"), "hello");
    expect(onChange).toHaveBeenCalled();
  });

  it("passes through value", () => {
    render(<Input value="test" readOnly data-testid="i" />);
    expect(screen.getByTestId("i")).toHaveValue("test");
  });
});

describe("Select", () => {
  it("renders a select element with options", () => {
    render(
      <Select data-testid="s">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    expect(screen.getByTestId("s")).toBeInTheDocument();
    expect(screen.getByTestId("s").tagName).toBe("SELECT");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is set", () => {
    render(
      <Select disabled data-testid="s">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByTestId("s")).toBeDisabled();
  });
});

describe("InputWithIcon", () => {
  it("renders the input with an icon", () => {
    const { container } = render(
      <InputWithIcon icon={<span data-testid="icon">🔍</span>} placeholder="Search" />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });
});

describe("Label", () => {
  it("renders label text", () => {
    render(<Label>Name</Label>);
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("renders required asterisk when required is true", () => {
    render(<Label required>Name</Label>);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders hint text when provided", () => {
    render(<Label hint="optional">Name</Label>);
    expect(screen.getByText("optional")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("renders label and children", () => {
    render(
      <Field label="Username">
        <Input data-testid="i" />
      </Field>,
    );
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByTestId("i")).toBeInTheDocument();
  });

  it("renders error message when error is provided", () => {
    render(
      <Field label="Name" error="Required">
        <Input />
      </Field>,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("renders help text when help is provided and no error", () => {
    render(
      <Field label="Name" help="Your full name">
        <Input />
      </Field>,
    );
    expect(screen.getByText("Your full name")).toBeInTheDocument();
  });

  it("shows error but not help when both are provided", () => {
    render(
      <Field label="Name" error="Error!" help="Help text">
        <Input />
      </Field>,
    );
    expect(screen.getByText("Error!")).toBeInTheDocument();
    expect(screen.queryByText("Help text")).not.toBeInTheDocument();
  });

  it("renders required asterisk in label when required is true", () => {
    render(
      <Field label="Name" required>
        <Input />
      </Field>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders hint in label when hint is provided", () => {
    render(
      <Field label="Name" hint="optional">
        <Input />
      </Field>,
    );
    expect(screen.getByText("optional")).toBeInTheDocument();
  });
});

describe("FormGrid", () => {
  it("renders children in a grid", () => {
    render(
      <FormGrid>
        <div>Col 1</div>
        <div>Col 2</div>
      </FormGrid>,
    );
    expect(screen.getByText("Col 1")).toBeInTheDocument();
    expect(screen.getByText("Col 2")).toBeInTheDocument();
  });
});

describe("Fieldset", () => {
  it("renders legend and children", () => {
    render(
      <Fieldset legend="Group">
        <div>Content</div>
      </Fieldset>,
    );
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <Fieldset legend="Group" description="A description">
        <div>Content</div>
      </Fieldset>,
    );
    expect(screen.getByText("A description")).toBeInTheDocument();
  });
});

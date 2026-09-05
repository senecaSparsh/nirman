// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import {
  Card,
  CardHeader,
  CardToolbar,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";

describe("Card", () => {
  it("renders children content", () => {
    render(
      <Card>
        <p>Card body</p>
      </Card>,
    );
    expect(screen.getByText("Card body")).toBeInTheDocument();
  });

  it("applies default variant classes", () => {
    render(<Card data-testid="c">content</Card>);
    const card = screen.getByTestId("c");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("border");
  });

  it("applies flush variant classes (no shadow)", () => {
    render(<Card variant="flush" data-testid="c">content</Card>);
    const card = screen.getByTestId("c");
    expect(card.className).toContain("border");
    expect(card.className).not.toContain("shadow-raised");
  });

  it("applies inset variant classes", () => {
    render(<Card variant="inset" data-testid="c">content</Card>);
    const card = screen.getByTestId("c");
    expect(card.className).toContain("bg-subtle");
  });

  it("adds interactive classes when interactive is true", () => {
    render(<Card interactive data-testid="c">content</Card>);
    const card = screen.getByTestId("c");
    expect(card.className).toContain("card-interactive");
    expect(card.className).toContain("cursor-pointer");
  });
});

describe("CardHeader", () => {
  it("renders children", () => {
    render(<CardHeader>Header content</CardHeader>);
    expect(screen.getByText("Header content")).toBeInTheDocument();
  });

  it("adds bottom border when divided is true", () => {
    render(<CardHeader divided data-testid="h">Header</CardHeader>);
    const header = screen.getByTestId("h");
    expect(header.className).toContain("border-b");
  });

  it("does not add bottom border when divided is not set", () => {
    render(<CardHeader data-testid="h">Header</CardHeader>);
    const header = screen.getByTestId("h");
    expect(header.className).not.toContain("border-b");
  });
});

describe("CardToolbar", () => {
  it("renders children", () => {
    render(<CardToolbar><span>Left</span><span>Right</span></CardToolbar>);
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });
});

describe("CardTitle", () => {
  it("renders the title text", () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });
});

describe("CardDescription", () => {
  it("renders the description text", () => {
    render(<CardDescription>A description</CardDescription>);
    expect(screen.getByText("A description")).toBeInTheDocument();
  });
});

describe("CardContent", () => {
  it("renders children", () => {
    render(<CardContent>Body content</CardContent>);
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });
});

describe("CardFooter", () => {
  it("renders children", () => {
    render(<CardFooter>Footer content</CardFooter>);
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  it("adds top border by default (divided defaults to true)", () => {
    render(<CardFooter data-testid="f">Footer</CardFooter>);
    const footer = screen.getByTestId("f");
    expect(footer.className).toContain("border-t");
  });

  it("does not add top border when divided is false", () => {
    render(<CardFooter divided={false} data-testid="f">Footer</CardFooter>);
    const footer = screen.getByTestId("f");
    expect(footer.className).not.toContain("border-t");
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import {
  Table,
  THead,
  TBody,
  TFoot,
  TR,
  TH,
  TD,
  TDNum,
  THNum,
  TDPrimary,
  TDActions,
  TREmpty,
} from "./table";

function renderTable(children: React.ReactNode) {
  return render(<Table>{children}</Table>);
}

describe("Table", () => {
  it("renders a table element", () => {
    renderTable(
      <TBody>
        <TR>
          <TD>Cell</TD>
        </TR>
      </TBody>,
    );
    expect(screen.getByText("Cell")).toBeInTheDocument();
  });

  it("wraps table in a scroll container", () => {
    const { container } = render(<Table><tbody><tr><td>x</td></tr></tbody></Table>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("overflow-auto");
  });
});

describe("THead", () => {
  it("renders a thead element", () => {
    const { container } = render(<Table><THead><TR><TH>Header</TH></TR></THead></Table>);
    expect(screen.getByText("Header")).toBeInTheDocument();
    const thead = container.querySelector("thead");
    expect(thead).not.toBeNull();
  });
});

describe("TBody", () => {
  it("renders a tbody element", () => {
    const { container } = render(<Table><TBody><TR><TD>Body</TD></TR></TBody></Table>);
    expect(screen.getByText("Body")).toBeInTheDocument();
    const tbody = container.querySelector("tbody");
    expect(tbody).not.toBeNull();
  });
});

describe("TFoot", () => {
  it("renders a tfoot element", () => {
    const { container } = render(<Table><TFoot><TR><TD>Total</TD></TR></TFoot></Table>);
    expect(screen.getByText("Total")).toBeInTheDocument();
    const tfoot = container.querySelector("tfoot");
    expect(tfoot).not.toBeNull();
  });
});

describe("TR", () => {
  it("renders a tr element", () => {
    const { container } = render(<Table><TBody><TR><TD>Row</TD></TR></TBody></Table>);
    const tr = container.querySelector("tr");
    expect(tr).not.toBeNull();
  });

  it("sets data-selected when selected is true", () => {
    const { container } = render(<Table><TBody><TR selected><TD>Row</TD></TR></TBody></Table>);
    const tr = container.querySelector("tr");
    expect(tr).toHaveAttribute("data-selected", "true");
  });
});

describe("TH", () => {
  it("renders a th element", () => {
    render(<Table><THead><TR><TH>Col</TH></TR></THead></Table>);
    expect(screen.getByText("Col")).toBeInTheDocument();
  });
});

describe("TD", () => {
  it("renders a td element", () => {
    render(<Table><TBody><TR><TD>Data</TD></TR></TBody></Table>);
    expect(screen.getByText("Data")).toBeInTheDocument();
  });
});

describe("TDNum", () => {
  it("renders a right-aligned td", () => {
    const { container } = render(<Table><TBody><TR><TDNum>100</TDNum></TR></TBody></Table>);
    const td = container.querySelector("td");
    expect(td?.className).toContain("text-right");
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});

describe("THNum", () => {
  it("renders a right-aligned th", () => {
    const { container } = render(<Table><THead><TR><THNum>Amount</THNum></TR></THead></Table>);
    const th = container.querySelector("th");
    expect(th?.className).toContain("text-right");
  });
});

describe("TDPrimary", () => {
  it("renders a td with font-medium", () => {
    const { container } = render(<Table><TBody><TR><TDPrimary>Primary</TDPrimary></TR></TBody></Table>);
    const td = container.querySelector("td");
    expect(td?.className).toContain("font-medium");
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });
});

describe("TDActions", () => {
  it("renders a td for actions", () => {
    const { container } = render(<Table><TBody><TR><TDActions><button>Edit</button></TDActions></TR></TBody></Table>);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("TREmpty", () => {
  it("renders empty state text in a row", () => {
    render(<Table><TBody><TREmpty colSpan={3}>No data</TREmpty></TBody></Table>);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("sets colSpan on the td", () => {
    const { container } = render(<Table><TBody><TREmpty colSpan={5}>No data</TREmpty></TBody></Table>);
    const td = container.querySelector("td");
    expect(td).toHaveAttribute("colspan", "5");
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("@/lib/use-fetch", () => ({ useFetch: vi.fn() }));

import { useFetch } from "@/lib/use-fetch";
import { WhoCanDialog } from "./who-can-dialog";

const holders = [
  {
    userId: "u1",
    name: "Asha Rao",
    email: "asha@example.com",
    role: "FINANCE_HEAD",
    label: "Finance head",
    global: true,
    projects: [],
    via: [{ kind: "ROLE", role: "FINANCE_HEAD", label: "Finance head" }],
  },
  {
    userId: "u2",
    name: null,
    email: "ravi@example.com",
    role: "PROJECT_MANAGER",
    label: "Project manager",
    global: false,
    projects: ["p1"],
    via: [{ kind: "PROJECT_HAT", projectId: "p1", projectName: "Tower A", role: "PROJECT_MANAGER" }],
  },
];

function fetchResult(data: unknown, error: string | null = null) {
  return { data, loading: false, error, retry: vi.fn() };
}

describe("WhoCanDialog", () => {
  beforeEach(() => {
    vi.mocked(useFetch).mockReturnValue(fetchResult(null) as never);
  });

  it("asks for a permission before showing anyone", () => {
    render(<WhoCanDialog onClose={() => {}} />);
    expect(screen.getByText("Choose a permission to see who holds it.")).toBeInTheDocument();
  });

  it("lists everyone who holds the chosen permission and how they got it", async () => {
    vi.mocked(useFetch).mockImplementation(((url: string) =>
      fetchResult(url.includes("finance.view") ? { permission: "finance.view", holders } : null)) as never);
    const { user } = render(<WhoCanDialog onClose={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox"), "finance.view");
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("ravi@example.com")).toBeInTheDocument();
    expect(screen.getByText("Company-wide")).toBeInTheDocument();
    expect(screen.getByText("Tower A")).toBeInTheDocument();
    expect(screen.getByText("Project role")).toBeInTheDocument();
  });

  it("says when nobody holds the permission", async () => {
    vi.mocked(useFetch).mockImplementation(((url: string) =>
      fetchResult(url.includes("finance.view") ? { permission: "finance.view", holders: [] } : null)) as never);
    const { user } = render(<WhoCanDialog onClose={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox"), "finance.view");
    expect(await screen.findByText("Nobody holds this permission")).toBeInTheDocument();
  });

  it("shows an error when the holders cannot be loaded", async () => {
    vi.mocked(useFetch).mockImplementation(((url: string) =>
      url.includes("finance.view") ? fetchResult(null, "Forbidden") : fetchResult(null)) as never);
    const { user } = render(<WhoCanDialog onClose={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox"), "finance.view");
    expect(await screen.findByText("Could not load who holds this permission.")).toBeInTheDocument();
  });
});

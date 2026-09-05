// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";

vi.mock("@/components/page-header", () => ({
  PageHeader: (props: { title: string; description: string }) => (
    <div data-testid="page-header">
      <h1>{props.title}</h1>
      <p>{props.description}</p>
    </div>
  ),
}));

vi.mock("./BackupSettings", () => ({
  BackupSettings: () => <div data-testid="backup-settings">Backup Settings</div>,
}));

import BackupPage from "./page";

describe("BackupPage", () => {
  it("renders the page header with Backup & Restore title", () => {
    const ui = BackupPage();
    render(ui);
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
  });

  it("renders the BackupSettings component", () => {
    const ui = BackupPage();
    render(ui);
    expect(screen.getByTestId("backup-settings")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    const ui = BackupPage();
    render(ui);
    expect(screen.getByText(/Download a complete copy/)).toBeInTheDocument();
  });
});

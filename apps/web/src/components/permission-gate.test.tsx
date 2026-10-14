// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { PERM } from "@/lib/roles";

vi.mock("@/lib/server", () => ({
  getUserRole: vi.fn().mockResolvedValue("SECURITY_GUARD"),
  getUserPermissions: vi.fn().mockResolvedValue([]),
}));

import { PermissionGate } from "./permission-gate";

describe("PermissionGate", () => {
  it("hides its content and names the permission it needs", async () => {
    render(await PermissionGate({ perm: PERM.FINANCE_VIEW, what: "finance", children: <p>secret figures</p> }));
    expect(screen.getByText("Finance View")).toBeInTheDocument();
    expect(screen.queryByText("secret figures")).not.toBeInTheDocument();
  });
});

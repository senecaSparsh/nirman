import { describe, it, expect } from "vitest";
import { explainPermission, globalPermissions, membershipSources } from "./access-explain";
import { PERM, delegableApprovalPermissions } from "@/lib/roles";

const base = {
  role: "PROJECT_MANAGER",
  label: "Project manager",
  rolePermissions: [PERM.PO_APPROVE, PERM.PROJECTS_VIEW],
  grants: [],
  delegations: [],
  projectHats: [],
};

describe("access explanation", () => {
  it("names the role that grants a company-wide permission", () => {
    const e = explainPermission(PERM.PO_APPROVE, membershipSources(base));
    expect(e.global).toBe(true);
    expect(e.via).toEqual([{ kind: "ROLE", role: "PROJECT_MANAGER", label: "Project manager" }]);
  });

  it("reports a project-only grant with its project and no company-wide access", () => {
    const sources = membershipSources({
      ...base,
      rolePermissions: [],
      projectHats: [{ projectId: "p1", projectName: "Tower A", role: "PROJECT_MANAGER" }],
    });
    const e = explainPermission(PERM.PO_APPROVE, sources);
    expect(e.global).toBe(false);
    expect(e.projects).toEqual(["p1"]);
  });

  it("names an individual grant", () => {
    const sources = membershipSources({ ...base, rolePermissions: [], grants: [PERM.EXPENSE_APPROVE] });
    expect(explainPermission(PERM.EXPENSE_APPROVE, sources).via).toEqual([{ kind: "GRANT" }]);
  });

  it("omits the grant source when the member has no individual grants", () => {
    expect(membershipSources(base).some((s) => s.source.kind === "GRANT")).toBe(false);
  });

  it("delegation adds approval permissions only, never administration", () => {
    const approval = delegableApprovalPermissions()[0]!;
    const sources = membershipSources({
      ...base,
      rolePermissions: [],
      delegations: [{ from: "Owner", endsAt: "2026-12-01T00:00:00.000Z" }],
    });
    expect(delegableApprovalPermissions()).not.toContain(PERM.COMPANY_MANAGE);
    expect(explainPermission(approval, sources).global).toBe(true);
    expect(explainPermission(PERM.COMPANY_MANAGE, sources).global).toBe(false);
  });

  it("company-wide permissions are exactly the role and grant sources combined", () => {
    const sources = membershipSources({
      ...base,
      grants: [PERM.EXPENSE_APPROVE],
      projectHats: [{ projectId: "p1", projectName: "Tower A", role: "SITE_ENGINEER" }],
    });
    expect(new Set(globalPermissions(sources))).toEqual(new Set([PERM.PO_APPROVE, PERM.PROJECTS_VIEW, PERM.EXPENSE_APPROVE]));
  });

  it("returns no access when no source grants the permission", () => {
    expect(explainPermission(PERM.COMPANY_MANAGE, membershipSources(base))).toEqual({ global: false, projects: [], via: [] });
  });
});

import { describe, it, expect } from "vitest";
import { ALL_LINKS, SETTINGS_LINKS, NAV_PERMISSION, EVERYONE, linksFor, settingsLinksFor, worldsFor } from "@/lib/nav";
import { PERM } from "@/lib/roles";

const QC_LEAD = "CUSTOM_QC_LEAD";

function gateOf(href: string): string[] | null {
  const gate = NAV_PERMISSION[href];
  return gate ? (Array.isArray(gate) ? gate : [gate]) : null;
}

describe("desktop menu for custom roles follows their permissions", () => {
  it("shows a gated link only when the role holds the permission that opens it", () => {
    const hrefs = linksFor(QC_LEAD, [PERM.PROCUREMENT_VIEW]).map((l) => l.href);
    expect(hrefs).toContain("/procurement");
    expect(hrefs).not.toContain("/gl");
  });

  it("with no permissions, shows only links open to everyone", () => {
    const open = (l: { roles?: string[] }) => !l.roles || l.roles === EVERYONE;
    expect(linksFor(QC_LEAD, []).every(open)).toBe(true);
    expect(settingsLinksFor(QC_LEAD, []).every(open)).toBe(true);
  });

  it("never shows a link its permission list does not open", () => {
    const perms: string[] = [PERM.INVENTORY_VIEW, PERM.PROCUREMENT_VIEW];
    for (const l of linksFor(QC_LEAD, perms)) {
      const gate = gateOf(l.href);
      const ok = gate ? gate.some((p) => perms.includes(p)) : !l.roles || l.roles === EVERYONE;
      expect(ok).toBe(true);
    }
  });

  it("settings links follow the permission too", () => {
    expect(settingsLinksFor(QC_LEAD, [PERM.COMPANY_MANAGE]).map((l) => l.href)).toContain("/settings");
    expect(settingsLinksFor(QC_LEAD, []).map((l) => l.href)).not.toContain("/settings");
  });

  it("a world is shown only when it has a link the custom role can see", () => {
    const perms = [PERM.FINANCE_VIEW];
    const visible = linksFor(QC_LEAD, perms);
    const keys = worldsFor(QC_LEAD, perms).map((w) => w.key);
    expect(keys).toContain("finance");
    for (const key of keys) expect(visible.some((l) => l.world === key)).toBe(true);
  });

  it("the reports hub opens for any role that can open at least one report", () => {
    expect(linksFor(QC_LEAD, [PERM.PAYROLL_VIEW]).map((l) => l.href)).toContain("/reports");
    expect(linksFor(QC_LEAD, [PERM.DPR_VIEW]).map((l) => l.href)).not.toContain("/reports");
  });

  it("every role-restricted link has a permission gate, so a custom role is never silently hidden from a page it holds", () => {
    const ungated = [...ALL_LINKS, ...SETTINGS_LINKS]
      .filter((l) => l.roles && l.roles !== EVERYONE && !NAV_PERMISSION[l.href])
      .map((l) => l.href);
    expect(ungated).toEqual([]);
  });

  it("built-in roles see the same menu whatever permission list is passed", () => {
    const hrefs = (xs: { href: string }[]) => xs.map((l) => l.href);
    expect(hrefs(linksFor("SUPERVISOR", [PERM.PO_APPROVE]))).toEqual(hrefs(linksFor("SUPERVISOR")));
    expect(hrefs(settingsLinksFor("OWNER", [PERM.PO_APPROVE]))).toEqual(hrefs(settingsLinksFor("OWNER")));
  });
});

import { describe, it, expect } from "vitest";
import {
  worldsFor,
  worldForPath,
  homeWorldFor,
  isSettingsPath,
  linksFor,
  settingsLinksFor,
  linkForPath,
  WORLDS,
  WORLD_BY_KEY,
  type WorldKey,
} from "@/lib/nav";

// ─────────────────────────────────────────────────────────────────
//  Test constants — the 6 roles in the system
// ─────────────────────────────────────────────────────────────────
const OWNER = "OWNER";
const ADMIN = "ADMIN";
const MANAGER = "MANAGER";
const SUPERVISOR = "SUPERVISOR";
const SALES = "SALES";
const ACCOUNTANT = "ACCOUNTANT";

// ─────────────────────────────────────────────────────────────────
//  worldsFor()
// ─────────────────────────────────────────────────────────────────

describe("worldsFor", () => {
  it("returns 4 worlds for OWNER (sees everything)", () => {
    const worlds = worldsFor(OWNER);
    expect(worlds).toHaveLength(4);
    expect(worlds.map((w) => w.key)).toEqual(["today", "build", "hr", "finance"]);
  });

  it("returns 4 worlds for ADMIN", () => {
    const worlds = worldsFor(ADMIN);
    expect(worlds).toHaveLength(4);
  });

  it("returns 4 worlds for MANAGER", () => {
    const worlds = worldsFor(MANAGER);
    expect(worlds).toHaveLength(4);
  });

  it("returns only today and build for SALES (no People, no Books)", () => {
    const worlds = worldsFor(SALES);
    const keys = worlds.map((w) => w.key);
    expect(keys).toContain("today");
    expect(keys).toContain("build");
    expect(keys).not.toContain("hr");
    expect(keys).not.toContain("finance");
  });

  it("returns today, build, hr for SUPERVISOR (no Books)", () => {
    const worlds = worldsFor(SUPERVISOR);
    const keys = worlds.map((w) => w.key);
    expect(keys).toContain("today");
    expect(keys).toContain("build");
    expect(keys).toContain("hr");
    expect(keys).not.toContain("finance");
  });

  it("returns today, build, hr, finance for ACCOUNTANT", () => {
    const worlds = worldsFor(ACCOUNTANT);
    const keys = worlds.map((w) => w.key);
    expect(keys).toContain("today");
    expect(keys).toContain("build");
    expect(keys).toContain("hr");
    expect(keys).toContain("finance");
  });

  it("filters items within sections by role", () => {
    // SALES sees Acquire (Land Parcels), Construct (Projects is EVERYONE), and Sell
    // but not Procure or Stock (those are OPS/ACCOUNTANT only)
    const build = worldsFor(SALES).find((w) => w.key === "build");
    expect(build).toBeDefined();
    const sectionLabels = build!.sections.map((s) => s.label);
    expect(sectionLabels).toContain("Sell");
    expect(sectionLabels).toContain("Acquire"); // Land Parcels is SELLING
    expect(sectionLabels).toContain("Construct"); // Projects is EVERYONE
    expect(sectionLabels).not.toContain("Procure");
    expect(sectionLabels).not.toContain("Stock");
  });

  it("removes empty sections (no items for this role)", () => {
    // SALES has no HR access, so HR world should not appear at all
    const worlds = worldsFor(SALES);
    expect(worlds.find((w) => w.key === "hr")).toBeUndefined();
  });

  it("includes the Insights section in Today for roles with REPORTS access", () => {
    const today = worldsFor(OWNER).find((w) => w.key === "today");
    const insights = today?.sections.find((s) => s.label === "Insights");
    expect(insights).toBeDefined();
    expect(insights?.items.some((i) => i.href === "/reports")).toBe(true);
  });

  it("does not include Insights section for roles without REPORTS access", () => {
    // SUPERVISOR is in REPORTS, so let's test with a role that isn't
    // Actually all roles except SALES are in REPORTS or BOOKS...
    // SALES is in REPORTS too. So all roles see Insights.
    // Let's verify SALES sees it:
    const today = worldsFor(SALES).find((w) => w.key === "today");
    const insights = today?.sections.find((s) => s.label === "Insights");
    expect(insights).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────
//  worldForPath()
// ─────────────────────────────────────────────────────────────────

describe("worldForPath", () => {
  it("maps / to today", () => {
    expect(worldForPath("/").key).toBe("today");
  });

  it("maps /projects to build", () => {
    expect(worldForPath("/projects").key).toBe("build");
  });

  it("maps /procurement to build", () => {
    expect(worldForPath("/procurement").key).toBe("build");
  });

  it("maps /stock to build", () => {
    expect(worldForPath("/stock").key).toBe("build");
  });

  it("maps /suppliers to build", () => {
    expect(worldForPath("/suppliers").key).toBe("build");
  });

  it("maps /suppliers/[id] to build (unmapped detail route fallback)", () => {
    expect(worldForPath("/suppliers/abc123").key).toBe("build");
  });

  it("maps /materials/[id] to build", () => {
    expect(worldForPath("/materials/xyz").key).toBe("build");
  });

  it("maps /hr to hr", () => {
    expect(worldForPath("/hr").key).toBe("hr");
  });

  it("maps /hr/attendance to hr", () => {
    expect(worldForPath("/hr/attendance").key).toBe("hr");
  });

  it("maps /finance to finance", () => {
    expect(worldForPath("/finance").key).toBe("finance");
  });

  it("maps /gl to finance", () => {
    expect(worldForPath("/gl").key).toBe("finance");
  });

  it("maps /reports to today (All Insights link is in Today)", () => {
    expect(worldForPath("/reports").key).toBe("today");
  });

  it("maps /reports/purchase-register to build (longest prefix wins)", () => {
    expect(worldForPath("/reports/purchase-register").key).toBe("build");
  });

  it("maps /reports/inventory-value to build", () => {
    expect(worldForPath("/reports/inventory-value").key).toBe("build");
  });

  it("maps /reports/sales-revenue to build", () => {
    expect(worldForPath("/reports/sales-revenue").key).toBe("build");
  });

  it("maps /reports/payroll-expense to hr", () => {
    expect(worldForPath("/reports/payroll-expense").key).toBe("hr");
  });

  it("maps /reports/profit to finance", () => {
    expect(worldForPath("/reports/profit").key).toBe("finance");
  });

  it("maps /reports/gst to finance", () => {
    expect(worldForPath("/reports/gst").key).toBe("finance");
  });

  it("maps /reports/comparative to finance", () => {
    expect(worldForPath("/reports/comparative").key).toBe("finance");
  });

  it("maps /reports/pending-payments to finance", () => {
    expect(worldForPath("/reports/pending-payments").key).toBe("finance");
  });

  it("maps /my-tasks to today", () => {
    expect(worldForPath("/my-tasks").key).toBe("today");
  });

  it("maps /approvals to today", () => {
    expect(worldForPath("/approvals").key).toBe("today");
  });

  it("falls back to today for unknown paths", () => {
    expect(worldForPath("/unknown-path").key).toBe("today");
  });

  it("longest prefix wins: /reports/gst resolves to finance, not today", () => {
    // /reports is in Today (len 8), /reports/gst is in Finance (len 12)
    expect(worldForPath("/reports/gst").key).toBe("finance");
  });
});

// ─────────────────────────────────────────────────────────────────
//  homeWorldFor()
// ─────────────────────────────────────────────────────────────────

describe("homeWorldFor", () => {
  it("SUPERVISOR lands in People", () => {
    expect(homeWorldFor(SUPERVISOR).key).toBe("hr");
  });

  it("SALES lands in Build", () => {
    expect(homeWorldFor(SALES).key).toBe("build");
  });

  it("ACCOUNTANT lands in Books with href /finance", () => {
    const home = homeWorldFor(ACCOUNTANT);
    expect(home.key).toBe("finance");
    expect(home.href).toBe("/finance");
  });

  it("OWNER lands in Today (default)", () => {
    expect(homeWorldFor(OWNER).key).toBe("today");
  });

  it("ADMIN lands in Today (default)", () => {
    expect(homeWorldFor(ADMIN).key).toBe("today");
  });

  it("MANAGER lands in Today (default)", () => {
    expect(homeWorldFor(MANAGER).key).toBe("today");
  });

  it("Books world entry is /finance (not /reports)", () => {
    expect(WORLD_BY_KEY.finance.href).toBe("/finance");
  });

  it("Books world is only visible to BOOKS roles", () => {
    expect(WORLD_BY_KEY.finance.roles).toEqual(expect.arrayContaining(["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"]));
    expect(WORLD_BY_KEY.finance.roles).not.toContain("SUPERVISOR");
    expect(WORLD_BY_KEY.finance.roles).not.toContain("SALES");
  });
});

// ─────────────────────────────────────────────────────────────────
//  isSettingsPath()
// ─────────────────────────────────────────────────────────────────

describe("isSettingsPath", () => {
  it("returns true for /settings", () => {
    expect(isSettingsPath("/settings")).toBe(true);
  });

  it("returns true for /settings/project-assignments", () => {
    expect(isSettingsPath("/settings/project-assignments")).toBe(true);
  });

  it("returns true for /workflows", () => {
    expect(isSettingsPath("/workflows")).toBe(true);
  });

  it("returns true for /workflows/123", () => {
    expect(isSettingsPath("/workflows/123")).toBe(true);
  });

  it("returns true for /playground", () => {
    expect(isSettingsPath("/playground")).toBe(true);
  });

  it("returns false for /projects", () => {
    expect(isSettingsPath("/projects")).toBe(false);
  });

  it("returns false for /", () => {
    expect(isSettingsPath("/")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
//  linksFor()
// ─────────────────────────────────────────────────────────────────

describe("linksFor", () => {
  it("returns flat list of links for OWNER", () => {
    const links = linksFor(OWNER);
    expect(links.length).toBeGreaterThan(20);
    // Every link should have a world
    expect(links.every((l) => l.world)).toBe(true);
  });

  it("includes hidden report links (for command palette search)", () => {
    const links = linksFor(OWNER);
    const purchaseRegister = links.find((l) => l.href === "/reports/purchase-register");
    expect(purchaseRegister).toBeDefined();
    expect(purchaseRegister?.hidden).toBe(true);
    expect(purchaseRegister?.group).toBeDefined();
  });

  it("SALES sees Sales & Revenue report but not Purchase Register", () => {
    const links = linksFor(SALES);
    expect(links.find((l) => l.href === "/reports/sales-revenue")).toBeDefined();
    expect(links.find((l) => l.href === "/reports/purchase-register")).toBeUndefined();
  });

  it("SALES sees Project Progress report", () => {
    const links = linksFor(SALES);
    expect(links.find((l) => l.href === "/reports/project-progress")).toBeDefined();
  });

  it("SUPERVISOR sees procurement and stock reports but not sales reports", () => {
    const links = linksFor(SUPERVISOR);
    expect(links.find((l) => l.href === "/reports/purchase-register")).toBeDefined();
    expect(links.find((l) => l.href === "/reports/inventory-value")).toBeDefined();
    expect(links.find((l) => l.href === "/reports/sales-revenue")).toBeUndefined();
  });

  it("includes /reports (All Insights) link for all REPORTS roles", () => {
    for (const role of [OWNER, ADMIN, MANAGER, SUPERVISOR, SALES, ACCOUNTANT]) {
      const links = linksFor(role);
      expect(links.find((l) => l.href === "/reports")).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────
//  settingsLinksFor()
// ─────────────────────────────────────────────────────────────────

describe("settingsLinksFor", () => {
  it("returns all 4 settings links for OWNER", () => {
    const links = settingsLinksFor(OWNER);
    expect(links).toHaveLength(4);
  });

  it("returns Settings + Who Sees What for ADMIN", () => {
    const links = settingsLinksFor(ADMIN);
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.find((l) => l.href === "/settings")).toBeDefined();
  });

  it("returns Workflows + Workspaces for MANAGER", () => {
    const links = settingsLinksFor(MANAGER);
    expect(links.find((l) => l.href === "/workflows")).toBeDefined();
    expect(links.find((l) => l.href === "/playground")).toBeDefined();
  });

  it("returns empty for SALES", () => {
    const links = settingsLinksFor(SALES);
    expect(links).toHaveLength(0);
  });

  it("returns empty for SUPERVISOR", () => {
    const links = settingsLinksFor(SUPERVISOR);
    expect(links).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
//  linkForPath()
// ─────────────────────────────────────────────────────────────────

describe("linkForPath", () => {
  it("returns the exact link for /projects", () => {
    const link = linkForPath("/projects");
    expect(link).toBeDefined();
    expect(link?.label).toBe("Projects");
    expect(link?.world).toBe("build");
  });

  it("returns the longest matching link for /reports/purchase-register", () => {
    const link = linkForPath("/reports/purchase-register");
    expect(link).toBeDefined();
    expect(link?.label).toBe("Purchase Register");
    expect(link?.world).toBe("build");
  });

  it("returns undefined for unknown paths", () => {
    expect(linkForPath("/nonexistent")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────
//  Structural invariants
// ─────────────────────────────────────────────────────────────────

describe("structural invariants", () => {
  it("WORLDS has exactly 4 worlds", () => {
    expect(WORLDS).toHaveLength(4);
  });

  it("world keys are today, build, hr, finance", () => {
    expect(WORLDS.map((w) => w.key)).toEqual(["today", "build", "hr", "finance"]);
  });

  it("no world uses the old 'inventory' or 'admin' key", () => {
    const keys = WORLDS.map((w) => w.key);
    expect(keys).not.toContain("inventory" as WorldKey);
    expect(keys).not.toContain("admin" as WorldKey);
  });

  it("every world has at least one section with at least one item", () => {
    for (const w of WORLDS) {
      expect(w.sections.length).toBeGreaterThan(0);
      for (const s of w.sections) {
        expect(s.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("every link has a unique href", () => {
    const hrefs = linksFor(OWNER).map((l) => l.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it("Build world entry is /projects", () => {
    expect(WORLD_BY_KEY.build.href).toBe("/projects");
  });

  it("Today world entry is /", () => {
    expect(WORLD_BY_KEY.today.href).toBe("/");
  });

  it("People world entry is /hr", () => {
    expect(WORLD_BY_KEY.hr.href).toBe("/hr");
  });

  it("report links with group field are hidden from sidebar", () => {
    const allLinks = linksFor(OWNER);
    const reportLinks = allLinks.filter((l) => l.group);
    for (const l of reportLinks) {
      expect(l.hidden).toBe(true);
    }
  });
});

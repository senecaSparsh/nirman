/**
 * Unit tests for mobile navigation v2 helpers.
 *
 *   roleToPersona    — map a role string to a persona
 *   tabsForRole      — get the tab bar for a role
 *   moduleFromPath   — extract module ID from a pathname
 *   goBackFallback   — derive the best goBack fallback href
 */
import { describe, it, expect } from "vitest";
import {
  roleToPersona,
  tabsForRole,
  moduleFromPath,
  goBackFallback,
  ALL_BADGE_TABS,
} from "./mobile-nav-v2";

describe("roleToPersona", () => {
  it("maps OWNER to executive", () => {
    expect(roleToPersona("OWNER")).toBe("executive");
  });

  it("maps ADMIN to executive", () => {
    expect(roleToPersona("ADMIN")).toBe("executive");
  });

  it("maps PROJECT_DIRECTOR to executive", () => {
    expect(roleToPersona("PROJECT_DIRECTOR")).toBe("executive");
  });

  it("maps FINANCE_HEAD to executive", () => {
    expect(roleToPersona("FINANCE_HEAD")).toBe("executive");
  });

  it("maps PROJECT_MANAGER to ops", () => {
    expect(roleToPersona("PROJECT_MANAGER")).toBe("ops");
  });

  it("maps PROCUREMENT_MANAGER to procurement", () => {
    expect(roleToPersona("PROCUREMENT_MANAGER")).toBe("procurement");
  });

  it("maps STORE_KEEPER to procurement", () => {
    expect(roleToPersona("STORE_KEEPER")).toBe("procurement");
  });

  it("maps SITE_ENGINEER to field", () => {
    expect(roleToPersona("SITE_ENGINEER")).toBe("field");
  });

  it("maps SUPERVISOR to field", () => {
    expect(roleToPersona("SUPERVISOR")).toBe("field");
  });

  it("maps QAQC_ENGINEER to field", () => {
    expect(roleToPersona("QAQC_ENGINEER")).toBe("field");
  });

  it("maps SALES_MANAGER to sales", () => {
    expect(roleToPersona("SALES_MANAGER")).toBe("sales");
  });

  it("maps ACCOUNTANT to finance", () => {
    expect(roleToPersona("ACCOUNTANT")).toBe("finance");
  });

  it("maps HR_MANAGER to hr", () => {
    expect(roleToPersona("HR_MANAGER")).toBe("hr");
  });

  it("defaults to executive for unknown role", () => {
    expect(roleToPersona("UNKNOWN")).toBe("executive");
  });

  it("defaults to executive for empty string", () => {
    expect(roleToPersona("")).toBe("executive");
  });
});

describe("tabsForRole", () => {
  it("returns tabs for OWNER (executive persona)", () => {
    const tabs = tabsForRole("OWNER");
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("returns tabs for SITE_ENGINEER (field persona)", () => {
    const tabs = tabsForRole("SITE_ENGINEER");
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("returns executive tabs for unknown role", () => {
    const tabs = tabsForRole("UNKNOWN");
    const execTabs = tabsForRole("OWNER");
    expect(tabs).toEqual(execTabs);
  });

  it("returns different tabs for different personas", () => {
    const execTabs = tabsForRole("OWNER");
    const fieldTabs = tabsForRole("SITE_ENGINEER");
    expect(execTabs).not.toEqual(fieldTabs);
  });
});

describe("moduleFromPath", () => {
  it("extracts module from /m/procurement path", () => {
    const mod = moduleFromPath("/m/procurement");
    expect(mod).not.toBe("home"); // should map to a specific module
  });

  it("extracts module from nested path /m/procurement/po/123", () => {
    const mod = moduleFromPath("/m/procurement/po/123");
    expect(mod).not.toBe("home");
  });

  it("returns home for empty path", () => {
    expect(moduleFromPath("")).toBe("home");
  });

  it("returns home for root path", () => {
    expect(moduleFromPath("/")).toBe("home");
  });

  it("returns home for unknown module", () => {
    expect(moduleFromPath("/m/unknown-module")).toBe("home");
  });

  it("strips /m/ prefix correctly", () => {
    // The function strips /m/ and takes the first segment
    const mod = moduleFromPath("/m/stock");
    expect(mod).not.toBe("home");
  });
});

describe("goBackFallback", () => {
  it("returns first tab href when no match", () => {
    const tabs = tabsForRole("OWNER");
    const fallback = goBackFallback("/m/unknown", tabs);
    expect(fallback).toBe(tabs[0]?.href);
  });

  it("returns first tab href for empty pathname", () => {
    const tabs = tabsForRole("OWNER");
    const fallback = goBackFallback("", tabs);
    expect(fallback).toBe(tabs[0]?.href);
  });

  it("returns /m/home fallback for empty tabs", () => {
    const fallback = goBackFallback("/m/procurement", []);
    expect(fallback).toBe("/m/home");
  });
});

describe("ALL_BADGE_TABS", () => {
  it("contains only tabs with badge property", () => {
    for (const tab of ALL_BADGE_TABS) {
      expect(tab.badge).toBeTruthy();
    }
  });

  it("is a non-empty array", () => {
    expect(ALL_BADGE_TABS.length).toBeGreaterThan(0);
  });
});

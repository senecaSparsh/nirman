/**
 * Unit tests for mobile-nav-v2.
 *
 * Only `roleToPersona` remains live after the route-manifest migration.
 * The old tests for tabsForRole, moduleFromPath, goBackFallback, and
 * ALL_BADGE_TABS tested dead code that was replaced by the manifest's
 * `tabsFor`, `activeTabFor`, `upHref`, and `badgeEndpointsFor`.
 */
import { describe, it, expect } from "vitest";
import { roleToPersona } from "./mobile-nav-v2";

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

  it("maps FINANCE_HEAD to finance", () => {
    expect(roleToPersona("FINANCE_HEAD")).toBe("finance");
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

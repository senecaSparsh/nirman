import { describe, it, expect } from "vitest";
import { WORLDS, SETTINGS_LINKS, NAV_PERMISSION, EVERYONE, type NavLink } from "@/lib/nav";
import { holdsPermission } from "@/lib/roles";
import reviewed from "./nav-drift.allowlist.json";

const BUILT_IN = [
  "OWNER", "ADMIN", "PROJECT_DIRECTOR", "FINANCE_HEAD", "PROJECT_MANAGER", "PROCUREMENT_MANAGER",
  "HR_MANAGER", "SITE_ENGINEER", "STORE_KEEPER", "ACCOUNTANT", "SALES_MANAGER", "SUPERVISOR",
  "QAQC_ENGINEER", "SECURITY_GUARD",
];

type Drift = Record<string, Record<string, "listOnly" | "permOnly">>;

function currentDrift(): Drift {
  const links: NavLink[] = [...WORLDS.flatMap((w) => w.sections.flatMap((s) => s.items)), ...SETTINGS_LINKS];
  const drift: Drift = {};
  for (const l of links) {
    const gate = NAV_PERMISSION[l.href];
    for (const role of BUILT_IN) {
      const listed = !l.roles || l.roles.includes(role);
      const opened = gate
        ? (Array.isArray(gate) ? gate : [gate]).some((p) => holdsPermission(role, p, []))
        : !l.roles || l.roles === EVERYONE;
      if (listed !== opened) (drift[l.href] ??= {})[role] = listed ? "listOnly" : "permOnly";
    }
  }
  return drift;
}

describe("built-in menus and permission gates", () => {
  it("disagree only in the reviewed cells (nav-drift.allowlist.json)", () => {
    expect(currentDrift()).toEqual(reviewed);
  });
});

import { describe, it, expect } from "vitest";
import { PERM } from "@/lib/roles";
import { assistantCaps } from "./assistant-access";

describe("assistantCaps", () => {
  it("a custom role answers from its own permission list, never a built-in stand-in", () => {
    const caps = assistantCaps({ rawRole: "CUSTOM_QC_LEAD", permissions: [PERM.INVENTORY_VIEW] });
    expect(caps.can(PERM.INVENTORY_VIEW)).toBe(true);
    expect(caps.can(PERM.FINANCE_VIEW)).toBe(false);
    expect(caps.can(PERM.PO_APPROVE)).toBe(false);
  });

  it("a built-in role also answers from permissions granted to that person", () => {
    const plain = assistantCaps({ rawRole: "SUPERVISOR", permissions: [] });
    const granted = assistantCaps({ rawRole: "SUPERVISOR", permissions: [PERM.PO_APPROVE] });
    expect(plain.can(PERM.PO_APPROVE)).toBe(false);
    expect(granted.can(PERM.PO_APPROVE)).toBe(true);
  });

  it("a built-in role keeps its own matrix", () => {
    const caps = assistantCaps({ rawRole: "PROJECT_MANAGER", permissions: [] });
    expect(caps.role).toBe("PROJECT_MANAGER");
    expect(caps.can(PERM.PROJECTS_MANAGE)).toBe(true);
  });

  it("labels a custom role with its own label, and falls back to the normalized role for greetings", () => {
    const caps = assistantCaps({ rawRole: "CUSTOM_QC_LEAD", label: "QC lead", permissions: [] });
    expect(caps.label).toBe("QC lead");
    expect(caps.role).toBe("SUPERVISOR");
  });

  it("never shows the raw CUSTOM_ key as a label", () => {
    expect(assistantCaps({ rawRole: "CUSTOM_QC_LEAD", permissions: [] }).label).toBe("Custom role");
  });
});

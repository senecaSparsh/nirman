import { describe, it, expect } from "vitest";
import { resolveStatutoryGuards } from "./employee-dossier";

describe("resolveStatutoryGuards — statutory PF/ESI defaults", () => {
  it("fills the ₹15,000 EPF wage cap when unset", () => {
    expect(resolveStatutoryGuards("EMPLOYEE_PF", null, null)).toEqual({ wageCap: 15000, wageCeiling: null });
    expect(resolveStatutoryGuards("EMPLOYER_PF", undefined, undefined)).toEqual({ wageCap: 15000, wageCeiling: null });
  });

  it("fills the ₹21,000 ESI eligibility ceiling when unset", () => {
    expect(resolveStatutoryGuards("EMPLOYEE_ESI", null, null)).toEqual({ wageCap: null, wageCeiling: 21000 });
    expect(resolveStatutoryGuards("EMPLOYER_ESI", null, null)).toEqual({ wageCap: null, wageCeiling: 21000 });
  });

  it("explicit caller values always win", () => {
    expect(resolveStatutoryGuards("EMPLOYEE_PF", 20000, null).wageCap).toBe(20000);
    expect(resolveStatutoryGuards("EMPLOYEE_ESI", null, 25000).wageCeiling).toBe(25000);
  });

  it("non-statutory types get no defaults", () => {
    expect(resolveStatutoryGuards("HRA", null, null)).toEqual({ wageCap: null, wageCeiling: null });
    expect(resolveStatutoryGuards("BASIC", null, null)).toEqual({ wageCap: null, wageCeiling: null });
  });
});

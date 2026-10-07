import { describe, expect, it } from "vitest";
import { requiresSaleAgreement } from "./sale-policy";

describe("sale agreement policy", () => {
  it("allows direct registry only for standalone land", () => {
    expect(requiresSaleAgreement("LAND", null)).toBe(false);
  });

  it.each(["LAND", "BUILT_UNIT", "PROJECT"])("requires an agreement for project-linked %s", assetType => {
    expect(requiresSaleAgreement(assetType, "project-1")).toBe(true);
  });

  it("does not treat missing project information on a unit as an exemption", () => {
    expect(requiresSaleAgreement("BUILT_UNIT", null)).toBe(true);
    expect(requiresSaleAgreement("UNKNOWN", null)).toBe(true);
  });
});

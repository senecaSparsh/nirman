import { describe, it, expect } from "vitest";
import { draftForRole, scopePayload, type MemberScopeDraft } from "./member-scope";

describe("draftForRole", () => {
  it("starts a field role on projects with one empty row to fill in", () => {
    expect(draftForRole("SITE_ENGINEER")).toEqual({ scopeType: "PROJECT", entries: [{}] });
  });

  it("leaves finance head company-wide unselected until someone chooses it", () => {
    expect(draftForRole("FINANCE_HEAD")).toEqual({ scopeType: null, entries: [] });
  });

  it("keeps owner and admin company-wide with no entries", () => {
    expect(draftForRole("ADMIN")).toEqual({ scopeType: "COMPANY", entries: [] });
  });

  it("drops a choice the new role is not allowed to hold", () => {
    const company: MemberScopeDraft = { scopeType: "COMPANY", entries: [] };
    expect(draftForRole("PROJECT_MANAGER", company)).toEqual({ scopeType: "PROJECT", entries: [{}] });
  });

  it("keeps a choice the new role is allowed to hold", () => {
    const company: MemberScopeDraft = { scopeType: "COMPANY", entries: [] };
    expect(draftForRole("FINANCE_HEAD", company)).toEqual(company);
  });
});

describe("scopePayload", () => {
  it("is null until the chosen scope names at least one project or department", () => {
    expect(scopePayload({ scopeType: null, entries: [] })).toBeNull();
    expect(scopePayload({ scopeType: "PROJECT", entries: [{}] })).toBeNull();
    expect(scopePayload({ scopeType: "DEPARTMENT", entries: [{}] })).toBeNull();
  });

  it("sends company-wide with no entries", () => {
    expect(scopePayload({ scopeType: "COMPANY", entries: [{ projectId: "p-1" }] })).toEqual({
      scopeType: "COMPANY",
      scopeEntries: [],
    });
  });

  it("sends each chosen project once and ignores empty rows", () => {
    expect(
      scopePayload({
        scopeType: "PROJECT",
        entries: [{ projectId: "p-1" }, {}, { projectId: "p-1" }, { projectId: "p-2" }],
      }),
    ).toEqual({
      scopeType: "PROJECT",
      scopeEntries: [{ projectId: "p-1" }, { projectId: "p-2" }],
    });
  });

  it("sends departments under their own key", () => {
    expect(scopePayload({ scopeType: "DEPARTMENT", entries: [{ departmentId: "d-1" }] })).toEqual({
      scopeType: "DEPARTMENT",
      scopeEntries: [{ departmentId: "d-1" }],
    });
  });
});

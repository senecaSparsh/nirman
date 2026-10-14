import { describe, it, expect } from "vitest";
import { PERM } from "@/lib/roles";
import {
  assignedProjectIdsFor,
  digestFor,
  digestText,
  missingSitesFor,
  type DigestItem,
  type DigestMember,
} from "./approval-digest";

const THRESHOLDS = { managerThreshold: "50000", adminThreshold: "500000" };
const DAY = 86_400_000;
const NOW = new Date("2026-03-10T00:00:00Z");
const OLD = new Date(NOW.getTime() - 3 * DAY);

function member(over: Partial<DigestMember> = {}): DigestMember {
  return {
    userId: "pm",
    ownRole: "PROJECT_MANAGER",
    poBaseRole: "PROJECT_MANAGER",
    delegatorRoles: [],
    permissions: [PERM.PO_APPROVE, PERM.REQUISITION_APPROVE, PERM.DPR_APPROVE_SUB_ADMIN],
    scopeType: "PROJECT",
    visibleProjectIds: ["p1"],
    visibleDepartmentIds: [],
    hats: {},
    ...over,
  };
}

function item(queue: DigestItem["queue"], over: Partial<DigestItem> = {}): DigestItem {
  return { queue, projectId: "p1", departmentId: null, submitterIds: [], amount: "10000", at: OLD, ...over };
}

function total(m: DigestMember, items: DigestItem[]): number {
  return digestFor(m, items, THRESHOLDS).total;
}

describe("digestFor: visibility", () => {
  it("a project-scoped approver counts only POs in their projects", () => {
    const d = digestFor(member(), [item("po", { projectId: "p1" }), item("po", { projectId: "p2" })], THRESHOLDS);
    expect(d.counts.po).toBe(1);
    expect(d.total).toBe(1);
  });

  it("a company-wide approver counts POs in every project", () => {
    const admin = member({ userId: "admin", ownRole: "ADMIN", poBaseRole: "ADMIN", scopeType: "COMPANY", visibleProjectIds: [] });
    expect(total(admin, [item("po", { projectId: "p1" }), item("po", { projectId: "p2" })])).toBe(2);
  });

  it("department approvers see indents only from their departments", () => {
    const m = member({ scopeType: "DEPARTMENT", visibleDepartmentIds: ["d1"], visibleProjectIds: [], permissions: [PERM.REQUISITION_APPROVE] });
    const d = digestFor(m, [item("indent", { projectId: null, departmentId: "d1" }), item("indent", { projectId: null, departmentId: "d2" })], THRESHOLDS);
    expect(d.counts.indent).toBe(1);
  });

  it("a department approver with no departments sees no indents", () => {
    const m = member({ scopeType: "DEPARTMENT", visibleDepartmentIds: [], visibleProjectIds: [], permissions: [PERM.REQUISITION_APPROVE] });
    expect(total(m, [item("indent", { projectId: null, departmentId: "d1" })])).toBe(0);
  });

  it("an indent with no department is invisible to department approvers", () => {
    const m = member({ scopeType: "DEPARTMENT", visibleDepartmentIds: ["d1"], visibleProjectIds: ["p1"], permissions: [PERM.REQUISITION_APPROVE] });
    expect(total(m, [item("indent", { projectId: "p1", departmentId: null })])).toBe(0);
  });

  it("POs follow the visible projects for department approvers", () => {
    const m = member({ scopeType: "DEPARTMENT", visibleDepartmentIds: ["d1"], visibleProjectIds: ["p1"], permissions: [PERM.PO_APPROVE] });
    expect(total(m, [item("po", { projectId: "p1" }), item("po", { projectId: "p2" })])).toBe(1);
  });
});

describe("digestFor: permission", () => {
  it("no line without the queue permission", () => {
    expect(total(member({ permissions: [PERM.INVENTORY_VIEW] }), [item("po")])).toBe(0);
  });

  it("a project hat grants approval only on its own project", () => {
    const m = member({ permissions: [], hats: { p1: "PROJECT_MANAGER" }, visibleProjectIds: ["p1", "p2"] });
    expect(total(m, [item("po", { projectId: "p1" }), item("po", { projectId: "p2" })])).toBe(1);
  });

  it("procurement manage through any hat counts for unordered indents", () => {
    const withHat = member({ permissions: [], hats: { p1: "PROCUREMENT_MANAGER" }, visibleProjectIds: ["p1"] });
    expect(total(withHat, [item("unordered", { projectId: "p1" })])).toBe(1);
    const without = member({ permissions: [], visibleProjectIds: ["p1"] });
    expect(total(without, [item("unordered", { projectId: "p1" })])).toBe(0);
  });

  it("the DPR sub-admin stage needs its own permission", () => {
    const d = digestFor(member({ permissions: [PERM.DPR_APPROVE_SUB_ADMIN] }), [item("dprSub"), item("dprAdmin")], THRESHOLDS);
    expect(d.counts.dprSub).toBe(1);
    expect(d.counts.dprAdmin).toBeUndefined();
  });
});

describe("digestFor: self approval", () => {
  it("an admin cannot approve their own PO", () => {
    const admin = member({ userId: "admin", ownRole: "ADMIN", poBaseRole: "ADMIN", scopeType: "COMPANY", permissions: [PERM.PO_APPROVE] });
    expect(total(admin, [item("po", { submitterIds: ["admin"] })])).toBe(0);
  });

  it("the owner can approve their own PO", () => {
    const owner = member({ userId: "owner", ownRole: "OWNER", poBaseRole: "OWNER", scopeType: "COMPANY", permissions: [PERM.PO_APPROVE] });
    expect(total(owner, [item("po", { submitterIds: ["owner"] })])).toBe(1);
  });

  it("nobody approves their own claim except the owner", () => {
    expect(total(member({ permissions: [PERM.EXPENSE_APPROVE] }), [item("claim", { submitterIds: ["pm"] })])).toBe(0);
    const owner = member({ userId: "owner", ownRole: "OWNER", poBaseRole: "OWNER", scopeType: "COMPANY", permissions: [PERM.EXPENSE_APPROVE] });
    expect(total(owner, [item("claim", { submitterIds: ["owner"] })])).toBe(1);
  });
});

describe("digestFor: PO value routing", () => {
  const countPOs = (m: DigestMember, amounts: string[]) =>
    digestFor(m, amounts.map((a) => item("po", { amount: a })), THRESHOLDS).counts.po ?? 0;

  it("a project manager approves only POs below the manager threshold", () => {
    expect(countPOs(member(), ["49999", "50000", "60000"])).toBe(1);
  });

  it("an admin approves up to the admin threshold but not beyond", () => {
    const admin = member({ userId: "admin", ownRole: "ADMIN", poBaseRole: "ADMIN", scopeType: "COMPANY", permissions: [PERM.PO_APPROVE] });
    expect(countPOs(admin, ["60000", "499999", "500000", "900000"])).toBe(2);
  });

  it("only the owner approves POs at the owner tier", () => {
    const owner = member({ userId: "owner", ownRole: "OWNER", poBaseRole: "OWNER", scopeType: "COMPANY", permissions: [PERM.PO_APPROVE] });
    expect(countPOs(owner, ["500000", "900000"])).toBe(2);
  });

  it("a delegate of an admin approves at admin rank", () => {
    expect(countPOs(member({ delegatorRoles: ["ADMIN"] }), ["60000", "500000"])).toBe(1);
  });

  it("a delegate of the owner approves at admin rank, never owner rank", () => {
    expect(countPOs(member({ delegatorRoles: ["OWNER"] }), ["60000", "500000"])).toBe(1);
  });

  it("a project hat lifts the PO rank on its own project", () => {
    const m = member({ ownRole: "SITE_ENGINEER", poBaseRole: "SITE_ENGINEER", permissions: [], hats: { p1: "PROJECT_MANAGER" } });
    expect(countPOs(m, ["10000", "60000"])).toBe(1);
  });
});

describe("digestFor: custom roles and ordering", () => {
  it("a custom role with expense approval sees claims but no POs", () => {
    const m = member({ userId: "cust", ownRole: "SUPERVISOR", poBaseRole: "SUPERVISOR", scopeType: "COMPANY", permissions: [PERM.EXPENSE_APPROVE] });
    const d = digestFor(m, [item("claim"), item("po")], THRESHOLDS);
    expect(d.counts.claim).toBe(1);
    expect(d.counts.po).toBeUndefined();
  });

  it("reports the oldest item among those the approver can act on", () => {
    const recent = new Date(NOW.getTime() - DAY);
    const d = digestFor(member(), [item("po", { projectId: "p1", at: recent }), item("po", { projectId: "p2", at: OLD })], THRESHOLDS);
    expect(d.oldestAt?.getTime()).toBe(recent.getTime());
  });
});

describe("missingSitesFor", () => {
  const sites = [
    { id: "p1", name: "Tower A" },
    { id: "p2", name: "Tower B" },
  ];

  it("names visible sites the approver can report on", () => {
    expect(missingSitesFor(member(), sites)).toEqual(["Tower A"]);
  });

  it("gives no site lines to members without DPR approval", () => {
    expect(missingSitesFor(member({ permissions: [PERM.PO_APPROVE] }), sites)).toEqual([]);
  });
});

describe("digestText", () => {
  it("summarises waiting approvals with the oldest age", () => {
    const text = digestText(
      { userId: "pm", counts: { po: 2, indent: 1 }, total: 3, oldestAt: new Date(NOW.getTime() - 3 * DAY) },
      [],
      NOW,
    );
    expect(text).toEqual({ title: "3 approvals waiting 3d+", message: "2 POs, 1 indent are waiting — oldest 3 days." });
  });

  it("reports sites without today's report when nothing is waiting", () => {
    const text = digestText({ userId: "pm", counts: {}, total: 0, oldestAt: null }, ["Tower A", "Tower B"], NOW);
    expect(text).toEqual({ title: "2 sites haven't reported today", message: "No progress report filed today: Tower A, Tower B." });
  });

  it("returns nothing when there is nothing to say", () => {
    expect(digestText({ userId: "pm", counts: {}, total: 0, oldestAt: null }, [], NOW)).toBeNull();
  });
});

describe("assignedProjectIdsFor", () => {
  const base = {
    scopeType: "PROJECT" as const,
    projectIds: [] as string[],
    departmentIds: [] as string[],
    explicit: false,
    ownRole: "SUPERVISOR",
    hatProjectIds: ["h1"],
    deptProjects: new Map<string, string[]>(),
  };

  it("an explicit project scope uses its own projects", () => {
    expect(assignedProjectIdsFor({ ...base, projectIds: ["p1"], explicit: true })).toEqual(["p1"]);
  });

  it("an explicit project scope with no projects sees nothing, even with hats", () => {
    expect(assignedProjectIdsFor({ ...base, explicit: true })).toEqual([]);
  });

  it("without an explicit scope, legacy project assignments apply", () => {
    expect(assignedProjectIdsFor(base)).toEqual(["h1"]);
  });

  it("a project manager without a scope sees nothing, as the server does", () => {
    expect(assignedProjectIdsFor({ ...base, ownRole: "PROJECT_MANAGER" })).toEqual([]);
  });

  it("a department scope sees the projects its departments are deployed to", () => {
    const deptProjects = new Map([
      ["d1", ["p1"]],
      ["d2", ["p2"]],
    ]);
    expect(assignedProjectIdsFor({ ...base, scopeType: "DEPARTMENT", departmentIds: ["d1"], deptProjects })).toEqual(["p1"]);
  });

  it("an explicit department scope with no departments sees nothing", () => {
    expect(assignedProjectIdsFor({ ...base, scopeType: "DEPARTMENT", explicit: true })).toEqual([]);
  });
});

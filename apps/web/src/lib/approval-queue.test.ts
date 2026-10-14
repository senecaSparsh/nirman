import { describe, it, expect } from "vitest";
import type { Prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import {
  canApproveIndentRow,
  canApprovePoRow,
  companyRequisitionFilter,
  notCreatedBy,
  notSubmittedBy,
  poValueThresholds,
} from "./approval-queue";

const decimal = (value: string) => ({ toString: () => value }) as unknown as Prisma.Decimal;
const TIERS = { managerThreshold: "50000", adminThreshold: "500000" };

describe("companyRequisitionFilter", () => {
  it("matches indents raised on a company project or a company department", () => {
    expect(companyRequisitionFilter("c1")).toEqual({
      OR: [{ project: { companyId: "c1" } }, { department: { companyId: "c1" } }],
    });
  });
});

describe("notSubmittedBy", () => {
  it("excludes indents the user requested or submitted, keeping rows with no submitter", () => {
    expect(notSubmittedBy("u1")).toEqual({
      AND: [
        { OR: [{ requestedById: { not: "u1" } }, { requestedById: null }] },
        { OR: [{ submittedById: { not: "u1" } }, { submittedById: null }] },
      ],
    });
  });
});

describe("notCreatedBy", () => {
  it("excludes rows the user created, keeping rows with no creator", () => {
    expect(notCreatedBy("u1")).toEqual({
      AND: [{ OR: [{ createdById: { not: "u1" } }, { createdById: null }] }],
    });
  });
});

describe("poValueThresholds", () => {
  it("uses the services defaults when the company has none set", () => {
    expect(poValueThresholds({ poApprovalThresholdManager: null, poApprovalThresholdAdmin: null })).toEqual({
      managerThreshold: "50000",
      adminThreshold: "500000",
    });
  });

  it("uses the company's own thresholds when set", () => {
    expect(
      poValueThresholds({ poApprovalThresholdManager: decimal("75000"), poApprovalThresholdAdmin: decimal("800000") }),
    ).toEqual({ managerThreshold: "75000", adminThreshold: "800000" });
  });
});

describe("canApprovePoRow", () => {
  it("needs the PO permission on the row's project", () => {
    expect(canApprovePoRow({ perms: [PERM.REQUISITION_APPROVE], rank: "OWNER" }, "10000", TIERS)).toBe(false);
  });

  it("lets a project manager approve only below the manager threshold", () => {
    const pm = { perms: [PERM.PO_APPROVE], rank: "PROJECT_MANAGER" };
    expect(canApprovePoRow(pm, "49999", TIERS)).toBe(true);
    expect(canApprovePoRow(pm, "50000", TIERS)).toBe(false);
  });

  it("lets an admin approve up to the admin threshold, not beyond", () => {
    const admin = { perms: [PERM.PO_APPROVE], rank: "ADMIN" };
    expect(canApprovePoRow(admin, "499999", TIERS)).toBe(true);
    expect(canApprovePoRow(admin, "500000", TIERS)).toBe(false);
  });

  it("lets only the owner approve at the owner tier", () => {
    expect(canApprovePoRow({ perms: [PERM.PO_APPROVE], rank: "OWNER" }, "900000", TIERS)).toBe(true);
    expect(canApprovePoRow({ perms: [PERM.PO_APPROVE], rank: "ADMIN" }, "900000", TIERS)).toBe(false);
  });

  it("is false when there is no gate for the row's project", () => {
    expect(canApprovePoRow(undefined, "10000", TIERS)).toBe(false);
  });
});

describe("canApproveIndentRow", () => {
  it("needs the indent permission on the row's project", () => {
    expect(canApproveIndentRow({ perms: [PERM.REQUISITION_APPROVE], rank: "SUPERVISOR" })).toBe(true);
    expect(canApproveIndentRow({ perms: [PERM.PO_APPROVE], rank: "OWNER" })).toBe(false);
  });

  it("is false when there is no gate for the row's project", () => {
    expect(canApproveIndentRow(undefined)).toBe(false);
  });
});

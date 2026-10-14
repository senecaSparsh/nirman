import { PERM, effectivePermissions, poApprovalRoleFor, roleTier, type Role } from "@/lib/roles";
import { canSelfApprovePurchaseOrder, canWaiveSelfApproval, poRankClears, requiredPoApprover } from "@nirman/services";

const DAY = 86_400_000;

export type DigestQueue = "po" | "indent" | "dprSub" | "dprAdmin" | "claim" | "unordered";

const PERMISSION: Record<DigestQueue, string> = {
  po: PERM.PO_APPROVE,
  indent: PERM.REQUISITION_APPROVE,
  dprSub: PERM.DPR_APPROVE_SUB_ADMIN,
  dprAdmin: PERM.DPR_APPROVE_ADMIN,
  claim: PERM.EXPENSE_APPROVE,
  unordered: PERM.PROCUREMENT_MANAGE,
};

export type DigestItem = {
  queue: DigestQueue;
  projectId: string | null;
  departmentId: string | null;
  submitterIds: string[];
  amount?: string;
  at: Date;
};

export type DigestMember = {
  userId: string;
  ownRole: Role;
  poBaseRole: Role;
  delegatorRoles: string[];
  permissions: string[];
  scopeType: "COMPANY" | "DEPARTMENT" | "PROJECT";
  visibleProjectIds: string[];
  visibleDepartmentIds: string[];
  hats: Record<string, Role>;
};

export type Thresholds = { managerThreshold: string; adminThreshold: string };

export type MemberDigest = {
  userId: string;
  counts: Partial<Record<DigestQueue, number>>;
  total: number;
  oldestAt: Date | null;
};

function hatFor(m: DigestMember, projectId: string | null): Role | undefined {
  return projectId ? m.hats[projectId] : undefined;
}

function holds(m: DigestMember, permission: string, projectId: string | null, anyHat: boolean): boolean {
  if (m.permissions.includes(permission)) return true;
  if (anyHat) return Object.values(m.hats).some((h) => effectivePermissions(h, []).includes(permission));
  const hat = hatFor(m, projectId);
  return !!hat && effectivePermissions(hat, []).includes(permission);
}

function visible(m: DigestMember, projectId: string | null, departmentId: string | null, byDepartment: boolean): boolean {
  if (m.scopeType === "COMPANY") return true;
  if (byDepartment && m.scopeType === "DEPARTMENT") return departmentId !== null && m.visibleDepartmentIds.includes(departmentId);
  return projectId !== null && m.visibleProjectIds.includes(projectId);
}

function actingFor(m: DigestMember, projectId: string | null): Role {
  const hat = hatFor(m, projectId);
  return hat && roleTier(hat) < roleTier(m.ownRole) ? hat : m.ownRole;
}

function approverRankFor(m: DigestMember, projectId: string | null): Role {
  const hat = hatFor(m, projectId);
  const own = hat && roleTier(hat) < roleTier(m.poBaseRole) ? hat : m.poBaseRole;
  return poApprovalRoleFor(own, m.delegatorRoles);
}

function selfApprovalAllowed(queue: DigestQueue, acting: Role): boolean {
  return queue === "po" ? canSelfApprovePurchaseOrder(acting) : canWaiveSelfApproval(acting);
}

export function digestFor(m: DigestMember, items: DigestItem[], thresholds: Thresholds): MemberDigest {
  const counts: Partial<Record<DigestQueue, number>> = {};
  let total = 0;
  let oldestAt: Date | null = null;
  for (const it of items) {
    if (!holds(m, PERMISSION[it.queue], it.projectId, it.queue === "unordered")) continue;
    if (!visible(m, it.projectId, it.departmentId, it.queue === "indent" || it.queue === "unordered")) continue;
    if (it.submitterIds.includes(m.userId) && !selfApprovalAllowed(it.queue, actingFor(m, it.projectId))) continue;
    if (it.queue === "po") {
      const required = requiredPoApprover(it.amount ?? "0", thresholds.managerThreshold, thresholds.adminThreshold);
      if (!poRankClears(approverRankFor(m, it.projectId), required)) continue;
    }
    counts[it.queue] = (counts[it.queue] ?? 0) + 1;
    total += 1;
    if (!oldestAt || it.at < oldestAt) oldestAt = it.at;
  }
  return { userId: m.userId, counts, total, oldestAt };
}

export function missingSitesFor(m: DigestMember, sites: { id: string; name: string }[]): string[] {
  return sites
    .filter((s) => visible(m, s.id, null, false) && (holds(m, PERM.DPR_APPROVE_SUB_ADMIN, s.id, false) || holds(m, PERM.DPR_APPROVE_ADMIN, s.id, false)))
    .map((s) => s.name);
}

const LABEL: Record<DigestQueue, (n: number) => string> = {
  po: (n) => `${n} PO${n > 1 ? "s" : ""}`,
  indent: (n) => `${n} indent${n > 1 ? "s" : ""}`,
  dprSub: (n) => `${n} DPR${n > 1 ? "s" : ""} awaiting sub-admin approval`,
  dprAdmin: (n) => `${n} DPR${n > 1 ? "s" : ""} awaiting admin approval`,
  claim: (n) => `${n} expense claim${n > 1 ? "s" : ""}`,
  unordered: (n) => `${n} approved indent${n > 1 ? "s" : ""} not yet ordered`,
};

const ORDER: DigestQueue[] = ["po", "indent", "dprSub", "dprAdmin", "claim", "unordered"];

export function digestText(
  d: MemberDigest,
  missingSites: string[],
  now: Date,
): { title: string; message: string } | null {
  if (d.total === 0 && missingSites.length === 0) return null;
  const missingLine = missingSites.length ? `No progress report filed today: ${missingSites.join(", ")}.` : "";
  if (d.total === 0) {
    return {
      title: `${missingSites.length} site${missingSites.length > 1 ? "s" : ""} haven't reported today`,
      message: missingLine,
    };
  }
  const oldestDays = d.oldestAt ? Math.floor((now.getTime() - d.oldestAt.getTime()) / DAY) : 0;
  const parts = ORDER.filter((q) => (d.counts[q] ?? 0) > 0)
    .map((q) => LABEL[q](d.counts[q]!))
    .join(", ");
  const age = oldestDays >= 1 ? `${oldestDays} day${oldestDays > 1 ? "s" : ""}` : "2+ days";
  return {
    title: `${d.total} approval${d.total > 1 ? "s" : ""} waiting ${oldestDays >= 1 ? `${oldestDays}d+` : "48h+"}`,
    message: [`${parts} ${d.total > 1 ? "are" : "is"} waiting — oldest ${age}.`, missingLine].filter(Boolean).join(" "),
  };
}

const UNSCOPED_WITHOUT_ASSIGNMENT = new Set(["OWNER", "ADMIN", "DEVELOPER", "PROJECT_DIRECTOR", "PROJECT_MANAGER"]);

export function assignedProjectIdsFor(input: {
  scopeType: "PROJECT" | "DEPARTMENT";
  projectIds: string[];
  departmentIds: string[];
  explicit: boolean;
  ownRole: string;
  hatProjectIds: string[];
  deptProjects: Map<string, string[]>;
}): string[] {
  if (input.scopeType === "PROJECT" && input.projectIds.length > 0) return input.projectIds;
  if (input.scopeType === "DEPARTMENT" && input.departmentIds.length > 0) {
    return [...new Set(input.departmentIds.flatMap((d) => input.deptProjects.get(d) ?? []))];
  }
  if (input.explicit) return [];
  if (UNSCOPED_WITHOUT_ASSIGNMENT.has(input.ownRole)) return [];
  return input.hatProjectIds;
}

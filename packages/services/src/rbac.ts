import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Hierarchical RBAC Service — the Admin → Sub-Admin → Sub-Sub-Admin
 * delegation hierarchy from the owner's system map.
 *
 * The three tiers map onto the existing role set:
 *   Admin         = OWNER / ADMIN   (scopeType COMPANY — unscoped, sees all)
 *   Sub-Admin     = MANAGER          (scopeType DEPARTMENT — sees their depts)
 *   Sub-Sub-Admin = SUPERVISOR       (scopeType PROJECT — sees their sites)
 *
 * The reporting line is per company-membership: a Sub-Sub-Admin in company X
 * reports to a Sub-Admin in the same company, who may report up to an Admin.
 * `UserCompany.reportsToUserCompanyId` is the self-relation that encodes this.
 *
 * Scope is a join table (`UserScope`) so one membership can hold multiple
 * scopes — a Sub-Admin managing departments A *and* B has two rows; a
 * Sub-Sub-Admin on sites P1 *and* P2 has two rows. COMPANY-scoped memberships
 * have no scope rows (unscoped = everything in the company).
 *
 * Every mutation runs inside a transaction that appends an AuditLog row.
 */

export type ScopeType = "COMPANY" | "DEPARTMENT" | "PROJECT";
export type ScopeKind = "DEPARTMENT" | "PROJECT";

/** Error with an HTTP-ish status code (mirrors HrError / TaskError pattern). */
export class RbacError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "RbacError";
    this.status = status;
  }
}

// ───────────────────────────────────────────────────────────
//  Pure helpers (unit-testable — no DB access)
// ───────────────────────────────────────────────────────────

/** Default scope type for a role when the membership doesn't set one. */
export function defaultScopeType(role: string): ScopeType {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "COMPANY";
    case "MANAGER":
      return "COMPANY"; // regional heads opt into DEPARTMENT explicitly
    case "SUPERVISOR":
      return "PROJECT";
    default:
      return "COMPANY"; // SALES / ACCOUNTANT default to company-wide
  }
}

/**
 * Resolve the effective scope type: the membership's explicit `scopeType`
 * wins; otherwise the role default. OWNER/ADMIN are always COMPANY (cannot
 * be scoped down — they are the "full system control" tier).
 */
export function resolveScopeType(
  membership: { scopeType: string | null; role: string },
): ScopeType {
  if (membership.role === "OWNER" || membership.role === "ADMIN") return "COMPANY";
  if (membership.scopeType === "DEPARTMENT" || membership.scopeType === "PROJECT") {
    return membership.scopeType;
  }
  return defaultScopeType(membership.role);
}

/**
 * Does a scope type require explicit scope entries?
 * COMPANY = no entries (unscoped). DEPARTMENT/PROJECT = entries required.
 */
export function requiresScopeEntries(scopeType: ScopeType): boolean {
  return scopeType !== "COMPANY";
}

/**
 * Validate that scope entries match the declared scope type.
 * - DEPARTMENT scope → every entry must have departmentId, no projectId.
 * - PROJECT scope    → every entry must have projectId, no departmentId.
 * - COMPANY scope    → no entries allowed.
 */
export function validateScopeEntries(
  scopeType: ScopeType,
  entries: { departmentId?: string | null; projectId?: string | null }[],
): void {
  if (scopeType === "COMPANY") {
    if (entries.length > 0) {
      throw new RbacError("COMPANY-scoped memberships cannot have scope entries");
    }
    return;
  }
  if (entries.length === 0) {
    throw new RbacError(`${scopeType}-scoped membership requires at least one scope entry`);
  }
  const expectedKind: ScopeKind = scopeType === "DEPARTMENT" ? "DEPARTMENT" : "PROJECT";
  for (const e of entries) {
    if (expectedKind === "DEPARTMENT") {
      if (!e.departmentId) throw new RbacError("DEPARTMENT scope entries need a departmentId");
      if (e.projectId) throw new RbacError("DEPARTMENT scope entries must not set projectId");
    } else {
      if (!e.projectId) throw new RbacError("PROJECT scope entries need a projectId");
      if (e.departmentId) throw new RbacError("PROJECT scope entries must not set departmentId");
    }
  }
}

/**
 * Prevent a reporting cycle: `reportsToId` must not be the membership itself
 * nor one of its own direct/indirect reports. The caller is expected to have
 * already fetched the chain; this is the pure check.
 */
export function wouldCreateCycle(
  candidateReportsToId: string,
  reportingChainIds: string[],
): boolean {
  return (
    candidateReportsToId === reportingChainIds[0] ||
    reportingChainIds.includes(candidateReportsToId)
  );
}

// ───────────────────────────────────────────────────────────
//  Scope resolution (DB-backed — used by list APIs to filter)
// ───────────────────────────────────────────────────────────

export interface ResolvedScope {
  /** COMPANY = unscoped (sees everything in the company). */
  scopeType: ScopeType;
  /** Department IDs the user can see (DEPARTMENT scope). Empty for COMPANY. */
  departmentIds: string[];
  /** Project IDs the user can see (PROJECT scope). Empty for COMPANY. */
  projectIds: string[];
}

/**
 * Resolve the current user's scope within the active company.
 * Returns null if the user has no membership in this company (caller should
 * treat as "no access"). A COMPANY scope returns empty arrays — the caller
 * interprets empty arrays + scopeType=COMPANY as "no filter".
 */
export async function resolveUserScope(
  userId: string,
  companyId: string,
): Promise<ResolvedScope | null> {
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { scopes: true },
  });
  if (!membership) return null;

  const scopeType = resolveScopeType(membership);
  if (scopeType === "COMPANY") {
    return { scopeType, departmentIds: [], projectIds: [] };
  }
  if (scopeType === "DEPARTMENT") {
    return {
      scopeType,
      departmentIds: membership.scopes.map((s) => s.departmentId).filter((d): d is string => !!d),
      projectIds: [],
    };
  }
  return {
    scopeType,
    departmentIds: [],
    projectIds: membership.scopes.map((s) => s.projectId).filter((p): p is string => !!p),
  };
}

/**
 * Walk the reporting chain upward from a membership: [self, manager, manager's
 * manager, ...] up to the top of the company. Used for the org-chart view and
 * for cycle prevention when assigning a reportsTo.
 */
export async function getReportingChain(userCompanyId: string): Promise<string[]> {
  const chain: string[] = [userCompanyId];
  let current = await prisma.userCompany.findUnique({
    where: { id: userCompanyId },
    select: { reportsToUserCompanyId: true },
  });
  const seen = new Set<string>([userCompanyId]);
  while (current?.reportsToUserCompanyId && !seen.has(current.reportsToUserCompanyId)) {
    chain.push(current.reportsToUserCompanyId);
    seen.add(current.reportsToUserCompanyId);
    current = await prisma.userCompany.findUnique({
      where: { id: current.reportsToUserCompanyId },
      select: { reportsToUserCompanyId: true },
    });
  }
  return chain;
}

// ───────────────────────────────────────────────────────────
//  Assignment mutations
// ───────────────────────────────────────────────────────────

export interface AssignScopeInput {
  /** The acting user (must be above the target in the hierarchy). */
  actorUserId: string;
  /** The user being assigned a scope. */
  userId: string;
  companyId: string;
  /** Role for the membership. Drives the default scope type. */
  role: string;
  /** Override the scope type (defaults by role if null). */
  scopeType?: ScopeType | null;
  /** Who this membership reports to (a UserCompany id in the same company). */
  reportsToUserCompanyId?: string | null;
  /** Scope entries (required for DEPARTMENT/PROJECT, forbidden for COMPANY). */
  scopeEntries?: { departmentId?: string; projectId?: string }[];
}

// ── Role hierarchy (mirrors roles.ts in the web app) ──
// Tier 1 = OWNER/ADMIN (Admin), Tier 2 = MANAGER (Sub-Admin),
// Tier 3 = SUPERVISOR/SALES/ACCOUNTANT (Sub-Sub-Admin).
// A role can only assign roles STRICTLY below its own tier.
const SVC_ROLE_TIER: Record<string, number> = {
  OWNER: 1,
  ADMIN: 1,
  MANAGER: 2,
  SUPERVISOR: 3,
  SALES: 3,
  ACCOUNTANT: 3,
};

function svcRoleTier(role: string): number {
  return SVC_ROLE_TIER[role] ?? 3;
}

/** Exported for unit testing — mirrors canAssignRole in the web app's roles.ts. */
export function _svcCanAssignRole(actorRole: string, targetRole: string): boolean {
  return svcCanAssignRole(actorRole, targetRole);
}

function svcCanAssignRole(actorRole: string, targetRole: string): boolean {
  const actorTier = svcRoleTier(actorRole);
  const targetTier = svcRoleTier(targetRole);
  if (actorTier >= 3) return false;
  if (actorRole === targetRole) return false; // no self-cloning
  if (actorTier < targetTier) return true; // strictly below
  if (actorTier === targetTier && actorRole !== targetRole) return true; // same tier, different role (OWNER↔ADMIN)
  return false;
}

/**
 * Create or update a user's company membership with hierarchical scope +
 * reporting line. Idempotent on (userId, companyId): re-running updates the
 * role, scopeType, reportsTo, and replaces the scope entries atomically.
 *
 * Validates:
 *  - the actor is above the target in the hierarchy (can assign the target role)
 *  - the target user exists
 *  - scope entries match the scope type
 *  - reportsTo is in the same company and doesn't create a cycle
 *  - department/project scope entries belong to the company
 */
export async function assignScopedMembership(input: AssignScopeInput) {
  // Actor authorization: must have a membership in this company.
  const actorMembership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: input.actorUserId, companyId: input.companyId } },
  });
  if (!actorMembership) {
    throw new RbacError("You are not a member of this company", 403);
  }

  // Hierarchy: actor must be able to assign the target role.
  if (!svcCanAssignRole(actorMembership.role, input.role)) {
    throw new RbacError(
      `Your role (${actorMembership.role}) cannot assign the ${input.role} role. You can only assign roles below your tier.`,
      403,
    );
  }

  const targetUser = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!targetUser) throw new RbacError("Target user not found", 404);

  const scopeType = input.scopeType ?? defaultScopeType(input.role);
  const entries = input.scopeEntries ?? [];
  validateScopeEntries(scopeType, entries);

  return prisma.$transaction(async (tx) => {
    // Upsert the membership.
    const existing = await tx.userCompany.findUnique({
      where: { userId_companyId: { userId: input.userId, companyId: input.companyId } },
    });

    // If the target already has a membership, the actor must be above the
    // target's CURRENT role too (can't reassign a peer or superior).
    if (existing && !svcCanAssignRole(actorMembership.role, existing.role)) {
      throw new RbacError(
        `This user is already a ${existing.role} — you cannot reassign a role at or above your tier.`,
        403,
      );
    }

    // Cycle check on reportsTo.
    if (input.reportsToUserCompanyId) {
      const reportsTo = await tx.userCompany.findUnique({
        where: { id: input.reportsToUserCompanyId },
      });
      if (!reportsTo || reportsTo.companyId !== input.companyId) {
        throw new RbacError("reportsTo membership must be in the same company", 400);
      }
      if (existing) {
        const chain = await getReportingChain(existing.id);
        if (wouldCreateCycle(input.reportsToUserCompanyId, chain)) {
          throw new RbacError("That reporting line would create a cycle", 400);
        }
      }
    }

    // Validate scope entries belong to this company.
    if (scopeType === "DEPARTMENT") {
      const deptIds = entries.map((e) => e.departmentId!).filter(Boolean);
      if (deptIds.length) {
        const valid = await tx.department.count({
          where: { id: { in: deptIds }, companyId: input.companyId, deletedAt: null },
        });
        if (valid !== deptIds.length) {
          throw new RbacError("One or more departments not found in this company", 404);
        }
      }
    }
    if (scopeType === "PROJECT") {
      const projIds = entries.map((e) => e.projectId!).filter(Boolean);
      if (projIds.length) {
        const valid = await tx.project.count({
          where: { id: { in: projIds }, companyId: input.companyId, deletedAt: null },
        });
        if (valid !== projIds.length) {
          throw new RbacError("One or more projects not found in this company", 404);
        }
      }
    }

    const membership = existing
      ? await tx.userCompany.update({
          where: { id: existing.id },
          data: {
            role: input.role,
            scopeType,
            reportsToUserCompanyId: input.reportsToUserCompanyId ?? null,
          },
        })
      : await tx.userCompany.create({
          data: {
            userId: input.userId,
            companyId: input.companyId,
            role: input.role,
            scopeType,
            reportsToUserCompanyId: input.reportsToUserCompanyId ?? null,
          },
        });

    // Replace scope entries.
    if (existing) {
      await tx.userScope.deleteMany({ where: { userCompanyId: membership.id } });
    }
    if (entries.length) {
      await tx.userScope.createMany({
        data: entries.map((e) => ({
          userCompanyId: membership.id,
          scopeKind: scopeType === "DEPARTMENT" ? "DEPARTMENT" : "PROJECT",
          departmentId: e.departmentId ?? null,
          projectId: e.projectId ?? null,
        })),
      });
    }

    await logAction(tx, {
      userId: input.actorUserId,
      action: "RBAC_ASSIGN_SCOPE",
      entityType: "UserCompany",
      entityId: membership.id,
      after: {
        userId: input.userId,
        companyId: input.companyId,
        role: input.role,
        scopeType,
        reportsToUserCompanyId: input.reportsToUserCompanyId ?? null,
        scopeEntryCount: entries.length,
      },
    });

    return tx.userCompany.findUnique({
      where: { id: membership.id },
      include: { scopes: true },
    });
  });
}

/**
 * The org chart beneath a given membership: direct reports, their reports,
 * etc. — one level at a time (caller recurses if a full tree is needed).
 */
export async function getDirectReports(userCompanyId: string) {
  return prisma.userCompany.findMany({
    where: { reportsToUserCompanyId: userCompanyId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      scopes: { include: { department: { select: { code: true, name: true } }, project: { select: { name: true } } } },
    },
    orderBy: { user: { name: "asc" } },
  });
}

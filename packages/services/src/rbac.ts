import { prisma } from "@nirman/db";
import { logAction } from "./audit";
import { withSerializableTransaction } from "./transaction";

/**
 * Hierarchical RBAC Service — the 5-tier delegation hierarchy.
 *
 * The five tiers map onto the 13-role set:
 *   Tier 1 — Executive:     OWNER / ADMIN (scopeType COMPANY — unscoped, sees all)
 *   Tier 2 — Senior Mgmt:   PROJECT_DIRECTOR / FINANCE_HEAD (DEPARTMENT)
 *   Tier 3 — Middle Mgmt:   PROJECT_MANAGER / PROCUREMENT_MANAGER / HR_MANAGER (DEPARTMENT)
 *   Tier 4 — Execution:     SITE_ENGINEER / STORE_KEEPER / ACCOUNTANT / SALES_MANAGER (PROJECT)
 *   Tier 5 — Field:         SUPERVISOR / QAQC_ENGINEER (PROJECT)
 *
 * The reporting line is per company-membership: a Tier 5 in company X
 * reports to a Tier 4 in the same company, who may report up to Tier 3, etc.
 * `UserCompany.reportsToUserCompanyId` is the self-relation that encodes this.
 *
 * Scope is a join table (`UserScope`) so one membership can hold multiple
 * scopes — a Tier 3 managing departments A *and* B has two rows; a
 * Tier 4 on sites P1 *and* P2 has two rows. COMPANY-scoped memberships
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
    case "PROJECT_DIRECTOR":
    case "FINANCE_HEAD":
      return "COMPANY"; // senior management — company-wide by default
    case "PROJECT_MANAGER":
    case "PROCUREMENT_MANAGER":
    case "HR_MANAGER":
      return "COMPANY"; // middle management opt into DEPARTMENT explicitly
    case "SITE_ENGINEER":
    case "STORE_KEEPER":
    case "SUPERVISOR":
    case "QAQC_ENGINEER":
    case "SECURITY_GUARD":
      return "PROJECT"; // field/execution roles are project-scoped
    case "ACCOUNTANT":
    case "SALES_MANAGER":
      return "COMPANY"; // accountant/sales default to company-wide
    default:
      return "COMPANY";
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
  if (
    membership.scopeType === "COMPANY" ||
    membership.scopeType === "DEPARTMENT" ||
    membership.scopeType === "PROJECT"
  ) {
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
 * Prevent a reporting cycle. Given `reportingChainIds` — the upward chain
 * walked from the candidate manager ([candidate, candidate's manager, ...]) —
 * returns true if `candidateReportsToId` appears in it: either it IS the
 * candidate (self-report) or it is a transitive manager of the candidate, so
 * making the candidate its reportsTo would close a loop.
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

  // Custom roles derive their default scope type from their baseRole — a
  // CUSTOM_* role based on SITE_ENGINEER gets PROJECT scope like a real
  // site engineer, not the fail-open COMPANY default unknown strings get.
  // Multi-role: the worn hat (activeRole, validated against the held set)
  // drives the role default — an explicit scopeType still wins over both.
  const wornRole =
    membership.activeRole &&
    [membership.role, ...membership.secondaryRoles].includes(membership.activeRole)
      ? membership.activeRole
      : membership.role;
  const scopeType = resolveScopeType({
    scopeType: membership.scopeType,
    role: await svcResolveBaseRole(wornRole, companyId),
  });
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
  /**
   * Multi-role: additional hats the member holds (extra roles they can
   * switch into). Each must be assignable by the actor — the same tier
   * rule as `role`. Duplicates of `role` are dropped.
   */
  secondaryRoles?: string[];
  /** Override the scope type (defaults by role if null). */
  scopeType?: ScopeType | null;
  /** Who this membership reports to (a UserCompany id in the same company). */
  reportsToUserCompanyId?: string | null;
  /** Scope entries (required for DEPARTMENT/PROJECT, forbidden for COMPANY). */
  scopeEntries?: { departmentId?: string; projectId?: string }[];
}

// ── Role hierarchy (mirrors roles.ts in the web app) ──
// 5-tier delegation hierarchy. A role can only assign roles STRICTLY below
// its own tier (with the T1 OWNER↔ADMIN exception for same-tier cross-assign).
const SVC_ROLE_TIER: Record<string, number> = {
  OWNER: 1,
  ADMIN: 1,
  PROJECT_DIRECTOR: 2,
  FINANCE_HEAD: 2,
  PROJECT_MANAGER: 3,
  PROCUREMENT_MANAGER: 3,
  HR_MANAGER: 3,
  SITE_ENGINEER: 4,
  STORE_KEEPER: 4,
  ACCOUNTANT: 4,
  SALES_MANAGER: 4,
  SUPERVISOR: 5,
  QAQC_ENGINEER: 5,
  SECURITY_GUARD: 5,
};

function svcRoleTier(role: string): number {
  return SVC_ROLE_TIER[role] ?? 5;
}

/**
 * Whether this role typically holds approval authority (tier 1–3: exec,
 * senior mgmt, middle mgmt). Used to decide who's worth nudging about
 * delegating their approvals before going on leave — field roles approve
 * nothing, so prompting them is noise.
 */
export function holdsApprovalAuthority(role: string | null | undefined): boolean {
  return svcRoleTier(role ?? "") <= 3;
}

/**
 * Whether a creator's own authority is sufficient to auto-approve what they
 * just created — i.e. they sit at the top of the approval hierarchy and no
 * higher reviewer exists to defer to.
 *
 * True only for tier-1 roles (OWNER / ADMIN / DEVELOPER). A middle manager or
 * staff member may hold *approval permission* over other people's records, but
 * their own creations still go through a second pair of eyes — the whole point
 * of the approval gate is that approver ≠ creator. At tier 1 there is no one
 * above the creator, so requiring a second approver is pure friction (and a
 * deadlock in single-owner companies). Auto-approving there removes that
 * friction while preserving separation of duties for everyone else.
 */
export function canAutoApprove(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "DEVELOPER";
}

/** Exported for unit testing — mirrors canAssignRole in the web app's roles.ts. */
export function _svcCanAssignRole(actorRole: string, targetRole: string): boolean {
  return svcCanAssignRole(actorRole, targetRole);
}

function svcCanAssignRole(actorRole: string, targetRole: string): boolean {
  const actorTier = svcRoleTier(actorRole);
  const targetTier = svcRoleTier(targetRole);
  return svcTierAllows(actorTier, actorRole, targetTier, targetRole);
}

/** The tier-delegation rule, applied to already-resolved tiers. */
function svcTierAllows(actorTier: number, actorRole: string, targetTier: number, targetRole: string): boolean {
  if (actorTier >= 5) return false; // Tier 5 can't assign anyone
  if (actorRole === targetRole) return false; // no self-cloning
  if (actorTier < targetTier) return true; // strictly below
  // Same tier, different role → allowed only for tier 1 (OWNER↔ADMIN)
  if (actorTier === 1 && actorTier === targetTier && actorRole !== targetRole) return true;
  return false;
}

/**
 * Resolve the numeric tier of a role string within a company — built-in or
 * custom. Custom roles read their `tier` column from the CustomRole row;
 * unknown strings return null (callers must fail closed).
 *
 * Never feed a possibly-custom role string to svcRoleTier() directly — it
 * returns 5 for anything not in the built-in table, so a tier-2 custom role
 * would silently pass a tier-3 actor's hierarchy check.
 */
async function svcResolveRoleTier(role: string, companyId: string): Promise<number | null> {
  if (typeof role !== "string" || role === "") return null;
  if (role in SVC_ROLE_TIER) return SVC_ROLE_TIER[role]!;
  if (role.startsWith("CUSTOM_")) {
    const cr = await prisma.customRole
      .findFirst({ where: { companyId, key: role }, select: { tier: true } })
      .catch(() => null);
    return cr?.tier ?? null;
  }
  return null;
}

/**
 * Resolve a role to the built-in role whose defaults apply — custom roles
 * resolve to their baseRole, built-ins pass through unchanged. Used where a
 * role's default scope type is derived (custom roles inherit their base
 * role's default, not the fail-open COMPANY fallback).
 */
async function svcResolveBaseRole(role: string, companyId: string): Promise<string> {
  if (typeof role !== "string" || !role.startsWith("CUSTOM_")) return role;
  const cr = await prisma.customRole
    .findFirst({ where: { companyId, key: role }, select: { baseRole: true } })
    .catch(() => null);
  // Scratch-mode roles (baseRole null) fall back to SUPERVISOR → PROJECT
  // scope default — the narrowest choice for a role with no declared base.
  return cr?.baseRole ?? (cr ? "SUPERVISOR" : role);
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
/**
 * Scope ceiling — nobody can grant visibility beyond their own scope.
 * A department-scoped HR manager must not mint company-wide sight lines or
 * scope someone into departments/projects the actor can't see. Resolves the
 * actor's OWN membership scope (delegation never widens it — borrowed
 * authority can't mint sight lines). Shared by assignScopedMembership and
 * createEmployeeAccount.
 */
export async function assertScopeWithinActor(
  actorUserId: string,
  companyId: string,
  scopeType: ScopeType,
  entries: { departmentId?: string | null; projectId?: string | null }[],
): Promise<void> {
  const actorScope = await resolveUserScope(actorUserId, companyId);
  if (!actorScope || actorScope.scopeType === "COMPANY") return;

  if (scopeType === "COMPANY") {
    throw new RbacError("You can't grant company-wide scope — your own access is narrower.", 403);
  }
  if (scopeType === "DEPARTMENT") {
    const actorDepts = new Set(actorScope.departmentIds);
    const bad = actorScope.scopeType !== "DEPARTMENT"
      || entries.some((e) => !e.departmentId || !actorDepts.has(e.departmentId));
    if (bad) {
      throw new RbacError("You can't grant department scope outside your own departments.", 403);
    }
  }
  if (scopeType === "PROJECT") {
    let allowed: Set<string>;
    if (actorScope.scopeType === "PROJECT") {
      allowed = new Set(actorScope.projectIds);
    } else {
      // Dept-scoped actor granting project scope: projects reachable
      // through their departments' deployed employees.
      const deployed = await prisma.employee.findMany({
        where: {
          companyId,
          departmentId: { in: actorScope.departmentIds },
          activeProjectId: { not: null },
        },
        select: { activeProjectId: true },
      });
      allowed = new Set(deployed.map((e) => e.activeProjectId!));
    }
    if (entries.some((e) => !e.projectId || !allowed.has(e.projectId))) {
      throw new RbacError("You can't grant project scope outside your own visibility.", 403);
    }
  }
}

export async function assignScopedMembership(input: AssignScopeInput) {
  // Actor authorization: must have a membership in this company.
  const actorMembership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: input.actorUserId, companyId: input.companyId } },
  });
  if (!actorMembership) {
    throw new RbacError("You are not a member of this company", 403);
  }

  // Resolve both sides' tiers through the DB — a CUSTOM_* role string maps
  // to tier 5 under svcRoleTier(), so a raw svcCanAssignRole() call would
  // let any tier 1-4 actor assign/manage a high-tier custom role.
  // Multi-role: the actor assigns with the hat they currently WEAR
  // (activeRole ?? role) — a dormant senior hat grants no assignment power.
  const actorWornRole = actorMembership.activeRole ?? actorMembership.role;
  const actorTier = await svcResolveRoleTier(actorWornRole, input.companyId);
  if (actorTier === null) {
    throw new RbacError("Your membership role is not recognized in this company", 403);
  }
  const inputTier = await svcResolveRoleTier(input.role, input.companyId);
  if (inputTier === null) {
    throw new RbacError(`Unknown role "${input.role}"`, 400);
  }

  // Hierarchy: actor must be able to assign the target role.
  if (!svcTierAllows(actorTier, actorWornRole, inputTier, input.role)) {
    throw new RbacError(
      `Your role (${actorWornRole}) cannot assign the ${input.role} role. You can only assign roles below your tier.`,
      403,
    );
  }

  // Multi-role: every additional hat must independently pass the same
  // tier rule — a secondary role is a real role, not a weaker grant.
  // `undefined` = leave the held set's extras unchanged (scope-only edits
  // must never clobber hats); `[]` = explicitly clear all extras.
  const secondaryRoles =
    input.secondaryRoles === undefined
      ? undefined
      : [...new Set(input.secondaryRoles)].filter((r) => r !== input.role);
  for (const secRole of secondaryRoles ?? []) {
    const secTier = await svcResolveRoleTier(secRole, input.companyId);
    if (secTier === null) {
      throw new RbacError(`Unknown role "${secRole}"`, 400);
    }
    if (!svcTierAllows(actorTier, actorWornRole, secTier, secRole)) {
      throw new RbacError(
        `Your role (${actorWornRole}) cannot assign the ${secRole} role. You can only assign roles below your tier.`,
        403,
      );
    }
  }

  const targetUser = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!targetUser) throw new RbacError("Target user not found", 404);

  // Default scope type comes from the role — custom roles inherit their
  // baseRole's default (a CUSTOM_ role based on SITE_ENGINEER gets PROJECT
  // scope, not the fail-open COMPANY fallback for unknown strings).
  //
  // PRESERVE semantics: `undefined` = leave the current value untouched;
  // `null` = explicit clear/reset. Without this, a reportsTo-only update
  // silently resets a department-scoped member to their role's default
  // scope and wipes every scope entry — data loss that looks like a save.
  const priorMembership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: input.userId, companyId: input.companyId } },
    select: { scopeType: true },
  });
  const roleDefaultScope = defaultScopeType(await svcResolveBaseRole(input.role, input.companyId));
  const priorScope = (priorMembership?.scopeType ?? null) as ScopeType | null;
  const scopeType = input.scopeType !== undefined
    ? (input.scopeType ?? roleDefaultScope)
    : (priorScope ?? roleDefaultScope);
  const entries = input.scopeEntries ?? [];
  // Entries only need validation when the caller actually sent them (or
  // the scope type itself is being (re)set — stale entries of the wrong
  // kind would linger otherwise).
  if (input.scopeEntries !== undefined || input.scopeType !== undefined) {
    validateScopeEntries(scopeType, entries);
  }

  // ── Scope ceiling: nobody can grant visibility beyond their own scope. ──
  // Runs on the RESOLVED scopeType so role-defaulted assignments are
  // covered too.
  await assertScopeWithinActor(input.actorUserId, input.companyId, scopeType, entries);

  return withSerializableTransaction(async (tx) => {
    // Upsert the membership.
    const existing = await tx.userCompany.findUnique({
      where: { userId_companyId: { userId: input.userId, companyId: input.companyId } },
    });

    // If the target already has a membership, the actor must be above the
    // target's CURRENT role too (can't reassign a peer or superior). A
    // stored role that no longer resolves (deleted custom role, garbage)
    // fails closed — the actor cannot touch it.
    // Multi-role: the check covers the target's whole held set — a dormant
    // senior hat still protects the target from a junior manager's edit.
    if (existing) {
      const existingHeldRoles = [...new Set([existing.role, ...existing.secondaryRoles])];
      for (const heldRole of existingHeldRoles) {
        const existingTier = await svcResolveRoleTier(heldRole, input.companyId);
        if (existingTier === null || !svcTierAllows(actorTier, actorWornRole, existingTier, heldRole)) {
          throw new RbacError(
            `This user is already a ${heldRole} — you cannot reassign a role at or above your tier.`,
            403,
          );
        }
      }
    }

    // ── Last top-tier guard: if this change strips every OWNER/ADMIN hat ──
    // from the member and no other active membership in the company holds
    // one (primary OR secondary), the company is orphaned — refuse before
    // writing. Mirrors the guard in PATCH /api/users/[id] and the members
    // DELETE route (which checks the same OWNER/ADMIN set).
    {
      const TIER1 = new Set(["OWNER", "ADMIN"]);
      const newHeld = [input.role, ...(secondaryRoles ?? existing?.secondaryRoles ?? [])];
      const hadTier1 = (existing ? [existing.role, ...existing.secondaryRoles] : []).some((r) => TIER1.has(r));
      const hasTier1 = newHeld.some((r) => TIER1.has(r));
      // Top-level protection — only an actor wearing the OWNER hat may
      // strip a member's last tier-1 hat; the tier-1 "peer" rule would
      // otherwise let an ADMIN demote the OWNER and seize the company.
      if (existing && hadTier1 && !hasTier1 && actorWornRole !== "OWNER") {
        throw new RbacError("Only the company owner can demote a top-level member.", 403);
      }
      if (existing && hadTier1 && !hasTier1) {
        const remaining = await tx.userCompany.count({
          where: {
            companyId: input.companyId,
            userId: { not: input.userId },
            active: true,
            user: { active: true },
            OR: [{ role: { in: [...TIER1] } }, { secondaryRoles: { hasSome: [...TIER1] } }],
          },
        });
        if (remaining === 0) {
          throw new RbacError("Cannot remove the company's last owner/admin", 400);
        }
      }
    }

    // Cycle check on reportsTo.
    if (input.reportsToUserCompanyId) {
      const reportsTo = await tx.userCompany.findUnique({
        where: { id: input.reportsToUserCompanyId },
      });
      if (!reportsTo || reportsTo.companyId !== input.companyId) {
        throw new RbacError("reportsTo membership must be in the same company", 400);
      }
      // An inactive membership can't hold a reporting line — approvals and
      // org-chart edges would dead-end at a deactivated member.
      if (!reportsTo.active) {
        throw new RbacError("reportsTo membership is deactivated", 400);
      }
      if (existing) {
        // Walk up from the CANDIDATE manager — a loop forms iff the target
        // membership sits in that chain (the target is, directly or
        // transitively, the candidate's own manager). Checking the target's
        // upward chain instead flags ancestors (not cycles) and lets the
        // real two-way loop (A→B while B→A) through.
        const candidateChain = await getReportingChain(input.reportsToUserCompanyId);
        if (wouldCreateCycle(existing.id, candidateChain)) {
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

    // Multi-role: the new held set is { role } ∪ secondaryRoles (or the
    // existing extras when secondaryRoles is omitted). If the target's
    // worn hat (activeRole) is no longer in the set, reset it — they fall
    // back to the primary role on next resolution.
    const effectiveSecondary = secondaryRoles ?? existing?.secondaryRoles ?? [];
    const newHeldSet = new Set([input.role, ...effectiveSecondary]);
    const activeRoleReset =
      existing?.activeRole && !newHeldSet.has(existing.activeRole)
        ? { activeRole: null }
        : {};

    const membership = existing
      ? await tx.userCompany.update({
          where: { id: existing.id },
          data: {
            role: input.role,
            ...(secondaryRoles !== undefined ? { secondaryRoles } : {}),
            ...activeRoleReset,
            scopeType,
            // `undefined` = preserve the existing manager; `null` = clear.
            reportsToUserCompanyId: input.reportsToUserCompanyId !== undefined
              ? input.reportsToUserCompanyId
              : (existing.reportsToUserCompanyId ?? null),
          },
        })
      : await tx.userCompany.create({
          data: {
            userId: input.userId,
            companyId: input.companyId,
            role: input.role,
            secondaryRoles: effectiveSecondary,
            scopeType,
            reportsToUserCompanyId: input.reportsToUserCompanyId ?? null,
          },
        });

    // Mirror the primary role onto User.role — list views and the
    // employee.user.role fallback read the mirror; the membership row is
    // authoritative but a stale mirror pollutes the held-set union in
    // canManageSpecificEmployee and renders wrong labels in member lists.
    if (existing?.role !== input.role) {
      await tx.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });
    }

    // ── reportsTo sync (membership → employee) — the two reporting fields
    //    are one line rendered twice: reportsToUserCompanyId drives
    //    approval/delegation chains, reportsToEmployeeId renders the org
    //    chart. Keep them aligned whenever both sides have linked records,
    //    or the org chart silently disagrees with approval routing.
    //    Only mirrors on an actual CHANGE — a scope update that re-sends the
    //    current value (or null) must not stomp an org chart set from the
    //    employee side. The receiving side gets its own cycle check too. ──
    if (
      input.reportsToUserCompanyId !== undefined &&
      (input.reportsToUserCompanyId ?? null) !== (existing?.reportsToUserCompanyId ?? null)
    ) {
      const memberEmployee = await tx.employee.findFirst({
        where: { userId: input.userId, companyId: input.companyId, deletedAt: null },
        select: { id: true },
      });
      if (memberEmployee) {
        const mgrEmployee = input.reportsToUserCompanyId
          ? await tx.userCompany
              .findUnique({
                where: { id: input.reportsToUserCompanyId },
                select: {
                  user: {
                    select: {
                      employees: {
                        where: { companyId: input.companyId, deletedAt: null },
                        select: { id: true, reportsToEmployeeId: true },
                        take: 1,
                      },
                    },
                  },
                },
              })
              .then((m) => m?.user.employees[0] ?? null)
          : null;
        const targetEmployeeId = mgrEmployee?.id ?? null;
        // Only mirror when the membership manager resolves to a real Employee
        // row. A manager without one (or an explicit membership-line clear)
        // must NOT wipe the employee-level org-chart line — it is the
        // canonical on-site hierarchy for workers without login accounts, and
        // an unresolvable target is "can't translate", not "no manager".
        if (targetEmployeeId !== null) {
          let cyclic = targetEmployeeId === memberEmployee.id;
          if (!cyclic) {
            let cur: string | null = mgrEmployee!.reportsToEmployeeId;
            const visited = new Set<string>([memberEmployee.id, targetEmployeeId]);
            while (cur) {
              if (visited.has(cur)) {
                cyclic = true;
                break;
              }
              visited.add(cur);
              const up = await tx.employee.findUnique({
                where: { id: cur },
                select: { reportsToEmployeeId: true },
              });
              cur = up?.reportsToEmployeeId ?? null;
            }
          }
          if (!cyclic) {
            await tx.employee.update({
              where: { id: memberEmployee.id },
              data: { reportsToEmployeeId: targetEmployeeId },
            });
          }
        }
      }
    }

    // Replace scope entries — but only when the caller actually addressed
    // them (sent scopeEntries) or is (re)setting the scope type. A
    // reportsTo-only update must not wipe a scoped member's boundaries.
    if (input.scopeEntries !== undefined || input.scopeType !== undefined) {
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
    }

    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
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

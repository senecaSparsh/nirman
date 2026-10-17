import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  normalizeRole,
  effectivePermissions,
  isCustomRole,
  roleTier,
  canAssignRole,
  canAssignCustomRole,
  delegableApprovalPermissions,
  poApprovalRoleFor,
  permissionsWithScopedRole,
  customPoApprovalRole,
  canManageOwnerLevelRole,
  ALL_ROLES,
  ALL_PERMISSIONS,
  APPROVER_ROLES,
  ROLES,
  prettifyRoleKey,
  type Role,
} from "@/lib/roles";
import { logAction, resolveUserScope, ServiceError } from "@nirman/services";
import { recordError, notifyDevelopersOfError } from "@/lib/error-triage";
import { normalizePhoneForLookup } from "@/lib/phone-otp";
import { getBackpressureStats, trackRequest } from "@/lib/backpressure";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { cached as withCache } from "@/lib/server-cache";

// ───────────────────────────────────────────────────────────
//  Request-scoped memoization (AsyncLocalStorage)
// ───────────────────────────────────────────────────────────
// A single API request calls getCurrentUser() 4-5× (apiHandler rate-limit
// check, requirePermission/requireUser, getCompany, getUserPermissions,
// getUserScope…) and getCompany() 2-3× — each doing a DB round-trip.
// Without memoization that's ~10-15 DB queries just for auth context on
// every request. This ALS-based cache deduplicates them to 1 query per
// resource per request. The cache is scoped to a single request via
// AsyncLocalStorage, so there's no cross-request leakage and no manual
// cleanup — the store is GC'd when the request completes.
//
// Promises are cached (not values) so concurrent callers share the same
// in-flight DB query (thundering-herd prevention). On rejection the cache
// entry is cleared so a retry gets a fresh attempt.

interface RequestContext {
  session?: Promise<unknown>;
  user?: Promise<CurrentUser | null>;
  company?: Promise<unknown>;
  permissions?: Promise<string[]>;
  navBootstrap?: Promise<NavBootstrap | null>;
  actingDelegations?: Promise<DelegationInfo[]>;
  ownActingRole?: Promise<Role>;
}

const requestContextALS = new AsyncLocalStorage<RequestContext>();

/**
 * Memoize an async function's result within the current request context.
 * If no request context is active (e.g. called outside apiHandler/layout),
 * falls back to executing the function directly with no caching.
 */
function memoizeInRequest<T>(
  key: keyof RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = requestContextALS.getStore();
  if (!ctx) return fn();
  const existing = ctx[key] as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().catch((err) => {
    // Clear on rejection so a retry within the same request gets a fresh attempt.
    if (ctx[key] === promise) (ctx as Record<string, unknown>)[key] = undefined;
    throw err;
  });
  (ctx as Record<string, unknown>)[key] = promise;
  return promise;
}

/**
 * Wrap a function execution in a request-scoped context. All
 * getCurrentUser/getCompany/getSession/getUserPermissions calls within
 * the wrapped execution share cached results. Called by apiHandler for
 * API routes and by the root layout for Server Components.
 */
export function runWithRequestContext<T>(fn: () => T): T {
  return requestContextALS.run({}, fn);
}

/**
 * Server-side helpers shared by API routes and Server Components.
 */
export async function getCompany() {
  return memoizeInRequest("company", async () => {
  const user = await getCurrentUser();
  const selectedId = (await cookies()).get("nirman-company-id")?.value;
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";

  // ── Fail closed: no company resolution without authentication ──
  // Without an authenticated user (and not in dev-bypass), we must NOT
  // resolve an arbitrary company from a cookie, and we must NOT create one
  // as a side effect of a GET. Redirect to sign-in: middleware only checks
  // session-cookie *presence*, so a stale cookie (expired session, DB reset)
  // reaches here — the user must land on /sign-in, not a 500 error boundary.
  // API routes never reach this branch: apiHandler's getSession() gate
  // returns 401 first. If one ever does, NEXT_REDIRECT is caught by
  // apiHandler's error mapping and still surfaces as a JSON error.
  if (!user && !isDevBypass) {
    redirect("/sign-in");
  }

  if (selectedId && user) {
    const selected = await prisma.company.findFirst({
      where: {
        id: selectedId,
        deletedAt: null,
        userMemberships: { some: { userId: user.id, active: true } },
      },
    });
    if (selected) return selected;
  }

  if (user?.companyId) {
    // Verify the user still has an ACTIVE membership in this company.
    // A terminated employee (deactivated UserCompany) should not resolve
    // to a company they no longer have access to.
    const assigned = await prisma.company.findFirst({
      where: {
        id: user.companyId,
        deletedAt: null,
        userMemberships: { some: { userId: user.id, active: true } },
      },
    });
    if (assigned) return assigned;
  }

  // In dev-bypass mode only, fall back to any company (no membership filter).
  if (isDevBypass) {
    const existing = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
  }

  // In production, filter by the user's memberships.
  if (user) {
    const member = await prisma.company.findFirst({
      where: {
        deletedAt: null,
        userMemberships: { some: { userId: user.id, active: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    if (member) return member;
  }

  // No company found. In dev-bypass mode, create a default one (onboarding).
  // In production, throw — an authenticated user without a company membership
  // is a provisioning error, not an onboarding flow. Auto-creating "My Company"
  // in production caused ghost companies during failed login attempts.
  if (isDevBypass) {
    return prisma.company.create({
      data: {
        name: "My Company",
        currency: "INR",
        ...(user
          ? { userMemberships: { create: { userId: user.id, role: user.role } } }
          : {}),
      },
    });
  }
  // A signed-in user with no resolvable company gets a clean 403, not a
  // 500 — "your account isn't provisioned" is a client-visible state (the
  // role-matrix probe surfaced 258 of these as Internal Server Errors).
  throw new ServiceError(
    "Your account isn't linked to a company yet — ask an administrator to complete your setup.",
    403,
  );
  });
}

/**
 * Returns the IDs of all companies in the current company's *group* —
 * the current company itself plus its siblings (shared parent), its direct
 * parent, and its direct children. Used to scope cross-company operations
 * (e.g. inter-company Stock Transfer Order destinations) to the same group,
 * matching the parent/child company hierarchy (ABP Group → Testify + ABP Realty).
 *
 * A standalone company (no parent, no children) returns just [currentId].
 */
export async function getCompanyGroupIds(current?: { id: string; parentCompanyId: string | null }): Promise<string[]> {
  const company = current ?? (await getCompany());
  // Collect: self, parent, siblings (same parent, excluding self), direct children.
  const ids = new Set<string>([company.id]);
  if (company.parentCompanyId) {
    ids.add(company.parentCompanyId);
    // Siblings: other companies sharing the same parent.
    const siblings = await prisma.company.findMany({
      where: { parentCompanyId: company.parentCompanyId, deletedAt: null, id: { not: company.id } },
      select: { id: true },
    });
    siblings.forEach((s) => ids.add(s.id));
  }
  const children = await prisma.company.findMany({
    where: { parentCompanyId: company.id, deletedAt: null },
    select: { id: true },
  });
  children.forEach((c) => ids.add(c.id));
  return [...ids];
}

/**
 * Returns IDs of every company that is a *descendant* of the given company —
 * direct children, grandchildren, and so on (BFS, depth-capped at 10 so a
 * hierarchy cycle can never loop forever).
 */
export async function getCompanyDescendantIds(companyId: string): Promise<string[]> {
  const ids = new Set<string>();
  let frontier = [companyId];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const children = await prisma.company.findMany({
      where: { parentCompanyId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    frontier = [];
    for (const c of children) {
      if (!ids.has(c.id) && c.id !== companyId) {
        ids.add(c.id);
        frontier.push(c.id);
      }
    }
  }
  return [...ids];
}

/**
 * Returns IDs of every company the user can *manage*: companies where they
 * hold an active membership, plus all descendants of those companies.
 *
 * This is the authorization set for hierarchy edits — creating a child
 * company or re-parenting onto a company must stay inside the caller's own
 * tree. Without this, anyone could graft a child under another tenant and
 * read its data through group-scoped queries (getCompanyGroupIds), since
 * group scope is relationship-based and does not check membership.
 */
export async function getManageableCompanyIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userCompany.findMany({
    where: { userId, active: true, company: { deletedAt: null } },
    select: { companyId: true },
  });
  const ids = new Set(memberships.map((m) => m.companyId));
  for (const root of [...ids]) {
    for (const d of await getCompanyDescendantIds(root)) ids.add(d);
  }
  return [...ids];
}

/**
 * Validate that all attachment upload IDs belong to the user's company.
 * Prevents cross-company attachment linking (e.g. linking another company's
 * upload ID to a safety record). Returns an error message string if any
 * attachment doesn't belong to the company, or null if all are valid.
 *
 * Empty/undefined attachment arrays are valid (no check needed).
 */
export async function validateAttachments(attachmentIds: string[] | undefined, companyId: string): Promise<string | null> {
  if (!attachmentIds || attachmentIds.length === 0) return null;
  const valid = await prisma.upload.findMany({
    where: { id: { in: attachmentIds }, companyId },
    select: { id: true },
  });
  if (valid.length !== attachmentIds.length) {
    return "One or more attachments do not belong to your company.";
  }
  return null;
}

/** Convert a Prisma Decimal (or string) to a JS number for client serialization. */
/** Parse a `?date=` query param — invalid strings become `undefined`
 *  instead of `Invalid Date`, which would otherwise 500 inside Prisma
 *  where clauses / date-fns arithmetic. */
export function dateParam(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v));
  return Number.isNaN(n) ? 0 : n;
}

// Zod request-body schemas live in ./schemas — re-exported so callers
// keep importing them from @/lib/server unchanged.
export * from "./schemas";

/**
 * Tenancy guard — the [id] path param must resolve to the caller's active
 * company or a company inside their manageable tree (their memberships +
 * descendants — the same set GET /api/companies lists). Without it any
 * COMPANY_MANAGE holder could read/alter another tenant's roster by id.
 * Returns null when access is allowed, or a 404 Response to return.
 */
export async function assertCompanyAccess(user: CurrentUser, id: string): Promise<Response | null> {
  const current = await getCompany();
  if (id === current.id) return null;
  const manageable = await getManageableCompanyIds(user.id);
  if (!manageable.includes(id)) return json({ error: "Company not found" }, { status: 404 });
  return null;
}

export function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

/**
 * Parse a JSON request body for routes that access fields without a zod
 * schema. `null` parses successfully as JSON but `body.foo` then throws —
 * this returns the body or a 400 Response for null/undefined/non-object
 * roots. Arrays pass through (array-root handlers need them).
 *
 *   const body = await jsonBody(req);
 *   if (body instanceof Response) return body;
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function jsonBody(req: Request): Promise<any> {
  const body = await req.json().catch(() => undefined);
  if (body == null || typeof body !== "object") {
    return json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  return body;
}

/**
 * Cached dev-bypass user — resolved once from the DB (first OWNER) so that
 * mutations which record `userId` (requisitions, POs, audit logs, etc.) don't
 * fail with FK violations on a non-existent "dev" id.
 */
let _devUser: { id: string; email: string; name: string; role: string; companyId: string | null } | null = null;

async function getDevBypassUser() {
  // Test-only: allow switching roles via x-test-role header OR cookie (dev
  // bypass mode only). The header covers API/CLI callers; the cookie lets a
  // real browser drive the UI as a specific role (document.cookie) without
  // spinning up real auth sessions per role.
  const testRole =
    (await headers()).get("x-test-role") ??
    (await cookies()).get("x-test-role")?.value;
  // Known permission tiers — used both to order the default-user fallback and
  // to distinguish a real role miss (fail closed) from a garbage role header.
  const rolePriority = ["OWNER","ADMIN","DEVELOPER","PROJECT_DIRECTOR","FINANCE_HEAD","PROJECT_MANAGER","PROCUREMENT_MANAGER","HR_MANAGER","SITE_ENGINEER","STORE_KEEPER","ACCOUNTANT","SALES_MANAGER","SUPERVISOR","QAQC_ENGINEER","SECURITY_GUARD"];
  // Optional: pin to a specific user (email or 10-digit phone) so browser tests
  // land in the right company/scope, not just the first user of that role.
  const testUser =
    (await headers()).get("x-test-user") ??
    (await cookies()).get("x-test-user")?.value;
  if (testUser || testRole) {
    // Match all stored phoneNormalized variants (10-digit vs 91-prefixed) —
    // the same normalization the real sign-in path uses.
    const phoneVariants = testUser ? normalizePhoneForLookup(testUser) : null;
    const u = await prisma.user.findFirst({
      where: testUser
        ? { OR: [{ email: testUser }, { phoneNormalized: { in: phoneVariants ?? [] } }, { phone: testUser }] }
        : { role: testRole },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
    if (u) {
      return { id: u.id, email: u.email, name: u.name, role: u.role ?? "ADMIN", companyId: u.companyId };
    }
    // An explicit x-test-user that matches NOBODY must not silently fall back
    // to the first OWNER — that's a privilege-escalation bug that makes
    // negative permission tests run as a superuser and falsely pass. Fail
    // closed so the test/developer sees the miss immediately.
    if (testUser) {
      throw new Error(`[dev-bypass] x-test-user "${testUser}" matched no user — refusing to fall back to a privileged account`);
    }
    // For x-test-role the distinction matters: a REAL role that resolves to
    // no user must fail loudly (a permission test expecting that role running
    // as superuser gives false confidence). A garbage/unrecognized role string
    // isn't trying to impersonate a specific tier — fall back to the default
    // user like an absent header.
    const isKnownRole = rolePriority.includes(testRole ?? "");
    if (isKnownRole) {
      throw new Error(`[dev-bypass] x-test-role "${testRole}" matched no user — refusing to fall back to a privileged account`);
    }
    // fall through to the default-user resolution below
  }

  if (_devUser) return _devUser;
  // Prefer the first OWNER (full permissions); fall back to ADMIN, then any
  // user; fall back to synthetic "dev" only if the DB has no users at all.
  let u = null;
  for (const role of rolePriority) {
    u = await prisma.user.findFirst({
      where: { role },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
    if (u) break;
  }
  if (!u) {
    u = await prisma.user.findFirst({
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
  }
  _devUser = u
    ? { id: u.id, email: u.email, name: u.name, role: u.role ?? "ADMIN", companyId: u.companyId }
    : { id: "dev", email: "dev@nirman.local", name: "Developer", role: "ADMIN", companyId: null };
  return _devUser;
}

/**
 * Get the authenticated session from the current request, or null if not
 * authenticated. When AUTH_BYPASS=true is set explicitly, returns a session
 * backed by the first real user in the DB (so mutations that record userId
 * work) — or a synthetic "dev" user only if the DB has no users yet. By
 * default (no AUTH_BYPASS), dev uses real Better-Auth sessions so that
 * sign-in / sign-out and per-role one-click login work end-to-end.
 */
export async function getSession() {
  return memoizeInRequest("session", async () => {
  // Dev bypass: skip auth entirely ONLY when AUTH_BYPASS=true is set
  // explicitly AND we're not in production. By default (no env var), dev uses
  // real Better-Auth sessions so sign-in / sign-out and one-click role login
  // work end-to-end. The NODE_ENV check prevents accidental bypass in production.
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") {
    const u = await getDevBypassUser();
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        companyId: u.companyId,
        active: true,
      },
    };
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session;
  } catch (err) {
    console.error("getSession failed:", err);
    return null;
  }
  });
}

/** Typed shape of the current user derived from the session. */
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  /** Phone number, when the account has one (phone-login users always do). */
  phone?: string | null;
  /** Normalized built-in role — used for permission/tier checks. */
  role: Role;
  /**
   * The raw stored role key — `CUSTOM_*` for a custom role. `role` collapses
   * these to a built-in via normalizeRole (the SUPERVISOR fallback), so any
   * surface that renders the user's role label must use rawRole +
   * roleDisplayLabel, not role.
   */
  rawRole?: string;
  companyId: string | null;
  active: boolean;
}

/**
 * Get the authenticated user as a typed object, or null. Resolves the
 * effective role from the default `User.role` (and, when a company
 * scope is active, the `UserCompany.role` membership takes precedence).
 *
 * Validates the user still exists in the DB — a stale session cookie
 * (e.g. after a DB re-seed) would otherwise produce FK violations when
 * the user ID is used as a foreign key in transactional records.
 *
 * In dev-bypass mode (AUTH_BYPASS=true set explicitly), the synthetic
 * "dev" user is returned without DB validation since it doesn't exist in
 * the DB — this is intentional for local development.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return memoizeInRequest("user", async () => {
  const session = await getSession();
  if (!session?.user) return null;
  const u = session.user as {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    companyId?: string | null;
    active?: boolean;
  };

  // Dev-bypass mode: the session already resolved to a real DB user (via
  // getDevBypassUser) or the synthetic "dev" fallback (empty DB before seeding).
  // For the synthetic fallback, return as-is without DB validation.
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";
  if (isDevBypass && u.id === "dev") {
    return {
      id: u.id,
      email: u.email ?? "",
      name: u.name ?? "",
      role: normalizeRole(u.role),
      rawRole: u.role,
      companyId: u.companyId ?? null,
      active: u.active ?? true,
    };
  }

  // Production / real session (or dev-bypass with a real DB user): validate
  // the user still exists — a stale session cookie (e.g. after a DB re-seed)
  // would otherwise produce FK violations when the user ID is used as a
  // foreign key in transactional records.
  const exists = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, role: true, companyId: true, active: true, phone: true },
  });
  if (!exists) return null;
  const role = normalizeRole(exists.role ?? u.role);
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    phone: exists.phone ?? null,
    role,
    rawRole: exists.role ?? u.role,
    companyId: exists.companyId ?? null,
    active: exists.active ?? true,
  };
  });
}

/**
 * Get the current user's role (normalized). Falls back to the least-privileged
 * role (SALES) when there is no session — never grants broad access by default.
 */
export async function getUserRole(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "SUPERVISOR";
  // Multi-role: when the user is wearing a secondary hat, that's the role
  // they act as (assignable-role lists, persona checks). NULL/stale hat or
  // no membership → the stored user role, exactly as before.
  const company = await getCompany().catch(() => null);
  const held = company ? await getHeldRoles(user.id, company.id) : null;
  // A deactivated account (e.g. terminated everywhere) keeps its stored
  // User.role, which would resurrect their old authority on any path where
  // getCompany() didn't gate first — collapse it to least-privileged.
  return held?.activeRole ?? (user.active === false ? "SUPERVISOR" : user.role);
}

/**
 * Get the current user's assigned project IDs (from ProjectAssignment).
 * Returns null if the user is unscoped (OWNER/ADMIN/MANAGER — sees all projects).
 * Returns an array of project IDs if the user has project assignments.
 * An empty array means the user is scoped but has no assignments (sees nothing).
 */
export async function getAssignedProjectIds(): Promise<string[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const company = await getCompany();

  // ── Explicit scopeType ALWAYS wins over the role default. ──
  // Previously the unscoped-role check ran first, so a member explicitly
  // PROJECT-scoped while wearing a management-tier hat (or a custom role
  // resolving to one) silently saw every project. Resolve scope first;
  // only fall back to role defaults when no explicit scope exists.
  const [membership, hierarchical] = await Promise.all([
    prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      select: { scopeType: true },
    }),
    resolveUserScope(user.id, company.id),
  ]);
  const hasExplicitScope = !!membership?.scopeType;

  if (hierarchical) {
    if (hierarchical.scopeType === "COMPANY") {
      return null; // explicit or role-default company scope = unscoped
    }
    if (hierarchical.scopeType === "PROJECT") {
      if (hierarchical.projectIds.length > 0) return hierarchical.projectIds;
      // Explicit PROJECT scope with no entries = sees nothing. No explicit
      // scope → fall through to the legacy table for pre-migration members.
      if (hasExplicitScope) return [];
    }
    if (hierarchical.scopeType === "DEPARTMENT") {
      if (hierarchical.departmentIds.length > 0) {
        const employeesInDept = await prisma.employee.findMany({
          where: { companyId: company.id, deletedAt: null, departmentId: { in: hierarchical.departmentIds }, activeProjectId: { not: null } },
          select: { activeProjectId: true },
          distinct: ["activeProjectId"],
        });
        const projectIds = employeesInDept.map((e) => e.activeProjectId).filter(Boolean) as string[];
        return projectIds; // empty = no projects visible
      }
      if (hasExplicitScope) return [];
    }
  }

  // No membership scope resolved — role-based default. Resolved on the OWN
  // hat (getOwnRole), not the acting role: delegation lifts the delegate's
  // permissions but must not widen their sight lines — a project-scoped
  // supervisor delegated by the OWNER keeps their own project scope.
  const ownRole = await getOwnRole();
  if (ownRole === "OWNER" || ownRole === "ADMIN" || ownRole === "DEVELOPER" || ownRole === "PROJECT_DIRECTOR" || ownRole === "PROJECT_MANAGER") {
    return null; // null = unscoped (all projects)
  }
  // SUPERVISOR, SALES, ACCOUNTANT are scoped to their assigned projects —
  // legacy ProjectAssignment fallback for members without UserScope rows.
  const assignments = await prisma.projectAssignment.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  return assignments.map((a) => a.projectId);
}

/**
 * Resolve the current user's hierarchical scope (Admin → Sub-Admin →
 * Sub-Sub-Admin) within the active company. Returns:
 *   - { scopeType: "COMPANY", ... } → unscoped, list APIs apply no filter
 *   - { scopeType: "DEPARTMENT", departmentIds } → filter lists to these depts
 *   - { scopeType: "PROJECT", projectIds } → filter lists to these projects
 * Falls back to COMPANY scope when the user has no membership (dev-bypass) so
 * the app keeps working in headless dev.
 */
export async function getUserScope() {
  const user = await getCurrentUser();
  const company = await getCompany();
  if (!user) {
    return { scopeType: "COMPANY" as const, departmentIds: [], projectIds: [] };
  }
  // A deactivated account sees nothing — an empty PROJECT scope filters
  // every list to zero rows and every write check throws (fail closed).
  if (user.active === false) {
    return { scopeType: "PROJECT" as const, departmentIds: [], projectIds: [] };
  }
  const scope = await resolveUserScope(user.id, company.id);
  if (!scope) {
    // resolveUserScope also returns null for a DEACTIVATED membership — a
    // terminated member mid-request, not a dev-bypass guest. Widening them
    // to COMPANY would hand back full-company reads for the request tail.
    if (await membershipDeactivated(user.id, company.id)) {
      return { scopeType: "PROJECT" as const, departmentIds: [], projectIds: [] };
    }
    return { scopeType: "COMPANY" as const, departmentIds: [], projectIds: [] };
  }
  return scope;
}

/**
 * Check if the current user has access to a specific project.
 * Unscoped users (OWNER/ADMIN/MANAGER) always have access.
 * Scoped users must have a ProjectAssignment for the project.
 */
export async function canAccessProject(projectId: string): Promise<boolean> {
  const assigned = await getAssignedProjectIds();
  if (assigned === null) return true; // unscoped
  return assigned.includes(projectId);
}

/**
 * Build a Prisma `where` clause for project-scoped queries.
 * Returns `{ id: { in: [...] } }` for scoped users, or `undefined`
 * for unscoped users (no filter — see all projects).
 */
export async function projectScopeFilter(): Promise<{ id: { in: string[] } } | undefined> {
  const assigned = await getAssignedProjectIds();
  if (assigned === null) return undefined;
  return { id: { in: assigned } };
}

/**
 * ───────────────────────────────────────────────────────────────
 *  GLOBAL SCOPE SYSTEM
 * ───────────────────────────────────────────────────────────────
 * A single, server-side scope resolver that works for ALL models.
 * Instead of writing scope filters in every page/API one by one,
 * call `scopeWhere("Employee", baseWhere)` and the correct filter is
 * applied automatically based on the viewer's scope type.
 *
 * How it works:
 *   COMPANY scope  → no filter (sees everything)
 *   DEPARTMENT scope → filters by departmentId (or equivalent FK)
 *   PROJECT scope  → filters by projectId / activeProjectId
 *
 * The filter is applied in the Prisma `where` clause — the server
 * never queries rows the viewer shouldn't see. This is NOT client-
 * side filtering; the data never leaves the database.
 *
 * Usage:
 *   const where = await scopeWhere("Employee", { companyId, deletedAt: null });
 *   const employees = await prisma.employee.findMany({ where });
 *
 *   const where = await scopeWhere("MaterialIssue", { companyId });
 *   const issues = await prisma.materialIssue.findMany({ where });
 */
/**
 * Models whose rows carry an Employee relation — the H1 wall must follow
 * the PERSON, not just the Employee table: an owner's leave request,
 * payroll line or attendance row is as private as their dossier. Mapping
 * to the relation path ("employee", or dotted for deeper nesting like
 * "payrollLine.employee"). A trailing "?" marks an OPTIONAL to-one
 * relation — rows with no employee linked stay visible.
 */
const EMPLOYEE_SUBJECT_RELATIONS: Record<string, string> = {
  WorkerAttendance: "employee",
  LeaveRequest: "employee",
  PayrollLine: "employee",
  PayrollLineComponent: "payrollLine.employee",
  SalaryHistory: "employee",
  EmployeeAdvance: "employee",
  SalaryComponent: "employee",
  EmployeeResource: "employee",
  EmployeeExit: "employee",
  EmployeeBenefit: "employee",
  DPRLaborLine: "employee?",
};

/**
 * The H1 subject wall expressed against a related Employee row.
 * Mirrors employeeVisibilityWhere (NULL-safe) but nested under a relation.
 */
async function employeeSubjectWhere(relationPath: string): Promise<Record<string, unknown>> {
  if (await isTopLevelViewer()) return {};
  const optional = relationPath.endsWith("?");
  const path = optional ? relationPath.slice(0, -1) : relationPath;
  const wall = { OR: [{ hierarchyLevel: null }, { hierarchyLevel: { not: 1 } }] };
  const parts = path.split(".");
  let clause: Record<string, unknown> = wall as Record<string, unknown>;
  for (let i = parts.length - 1; i >= 0; i--) clause = { [parts[i]!]: clause };
  return optional ? { OR: [{ [parts[0]!]: null }, clause] } : clause;
}

export async function scopeWhere(
  model: string,
  baseWhere: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const scope = await getUserScope();

  // ── H1 wall — owner/admin dossiers are invisible to anyone below top
  //    level, at EVERY scope. Applies to Employee rows themselves AND to
  //    rows about an H1 employee (leave, attendance, payroll…) — the wall
  //    protects the person, not the table. ──
  if (model === "Employee") {
    baseWhere = { ...baseWhere, ...(await employeeVisibilityWhere()) };
  }
  const subjectRel = EMPLOYEE_SUBJECT_RELATIONS[model];
  if (subjectRel) {
    baseWhere = { ...baseWhere, ...(await employeeSubjectWhere(subjectRel)) };
  }

  // COMPANY scope = unscoped = sees everything
  if (scope.scopeType === "COMPANY") return baseWhere;

  // Map each model to its scope-relevant foreign key
  const SCOPE_FIELDS: Record<string, { department?: string | string[]; project?: string | string[] }> = {
    // HR
    Employee:             { department: "departmentId", project: "activeProjectId" },
    WorkerAttendance:     { project: "projectId" },
    // LeaveRequest has no projectId/departmentId — scope through the
    // employee's assignment (same path PayrollLine/EmployeeAdvance use).
    LeaveRequest:        { department: "employee.departmentId", project: "employee.activeProjectId" },
    PayrollLine:          { department: "employee.departmentId", project: "employee.activeProjectId" },
    // Salary advances scope through the employee (no own projectId) — same
    // path PayrollLine uses.
    EmployeeAdvance:      { department: "employee.departmentId", project: "employee.activeProjectId" },
    // Inventory
    MaterialIssue:        { project: "projectId", department: "departmentId" },
    MaterialRequisition:  { project: "projectId", department: "departmentId" },
    // Movements have no projectId — they scope through their locations: a
    // project-scoped user sees any movement touching a location that belongs
    // to their projects (either end), incl. warehouse → site receipts.
    StockMovement:        { project: ["fromLocation.projectId", "toLocation.projectId"] },
    // GRNs have no projectId — they scope via their PO's project or the
    // receiving location's project (site stores).
    GoodsReceipt:         { project: ["purchaseOrder.projectId", "location.projectId"] },

    // Projects / Construction
    // Task is intentionally not scopeable — see KNOWN_UNSCOPABLE below.
    Crew:                 { project: "projectId" },
    DailyProgressReport:  { project: "projectId" },
    QuotationRequest:     { project: "projectId" },
    Quotation:            { project: "projectId" }, // alias for backward compat
    ChangeOrder:          { project: "projectId" },
    SubcontractorWorkOrder: { project: "projectId" },
    MeasurementBookEntry: { project: "projectId" },
    RaBill:               { project: "projectId" },
    BoqItem:              { project: "projectId" },
    WbsNode:              { project: "projectId" },
    ProjectPhase:         { project: "projectId" },
    ProjectCost:          { project: "projectId" },
    ProjectAssignment:    { project: "projectId" },
    // The project entity itself — project-scoped users see only their assigned
    // projects in lists/pickers (filter by the project's own id).
    Project:              { project: "id" },
    BuiltUnit:            { project: "projectId" },
    Tenancy:              { project: "projectId" },
    // Procurement
    PurchaseOrder:        { project: "projectId" },
    // Finance
    Expense:              { project: "projectId" },
    ExpenseBudget:        { project: "projectId" },
    ExpenseClaim:         { project: "projectId" },
    RecurringExpense:     { project: "projectId" },
    PettyCashFloat:       { project: "projectId" },
    AssetSale:            { project: "projectId" },
    MaterialSale:         { project: "projectId" },
    // Payment rows scope through their parent sale — a receipt/instalment for
    // a Site Two unit is invisible to a Site One-scoped user.
    AssetSalePayment:     { project: "assetSale.projectId" },
    MaterialSalePayment:  { project: "sale.projectId" },
    PaymentScheduleItem:  { project: "paymentSchedule.assetSale.projectId" },
    // Land
    LandPurchase:         { project: "projectId" },
    LandParcel:           { project: "projectId" },
    // Safety
    NonConformanceReport: { project: "projectId" },
    SafetyHazard:         { project: "projectId" },
    SafetyIncident:       { project: "projectId" },
    SafetyInspection:     { project: "projectId" },
    Capa:                 { project: "projectId" },
    // Sales / CRM
    Lead:                 { project: "projectId" },
    // Gate
    // A gate pass scopes to the project tag OR the issuing location's
    // project — a pass physically leaving Site One Store is a Site One
    // pass even when projectId is null (company-level tag missing).
    GatePass:             { project: ["projectId", "location.projectId"], department: "location.departmentId" },
    // Equipment
    EquipmentAssignment:  { project: "projectId" },
    EquipmentUsageLog:    { project: "projectId" },
    // Renovations run inside a project; site stores belong to a project or
    // department — both are scopeable.
    RenovationProject:    { project: "projectId" },
    StockLocation:        { project: "projectId", department: "departmentId" },
    StockLocationItem:    { project: "location.projectId", department: "location.departmentId" },
    // Employee-dossier satellites — scope through the employee's own
    // department/deployment, and the H1 subject wall applies on top.
    SalaryHistory:        { department: "employee.departmentId", project: "employee.activeProjectId" },
    EmployeeResource:     { department: "employee.departmentId", project: "employee.activeProjectId" },
    EmployeeExit:         { department: "employee.departmentId", project: "employee.activeProjectId" },
    // Procurement returns/payments scope through their PO or location.
    SupplierPayment:      { project: "purchaseOrder.projectId" },
    SupplierInvoice:      { project: "purchaseOrder.projectId" },
    SupplierReturn:       { project: "location.projectId", department: "location.departmentId" },
    DirectPurchase:       { project: "location.projectId", department: "location.departmentId" },
    MaterialSaleReturn:   { project: "materialSale.projectId" },
    LegalDocument:        { project: "projectId" },
    ScrapGeneration:      { project: "projectId" },
    // Trips have no projectId — scope via either endpoint's location.
    VehicleTrip:          { project: ["fromLocation.projectId", "toLocation.projectId"] },
    // Transfers the same — a project user sees transfers touching their
    // sites' locations on either end.
    StockTransfer:        { project: ["fromLocation.projectId", "toLocation.projectId"] },
    StockCount:           { project: "location.projectId", department: "location.departmentId" },
    StockCountLine:       { project: "stockCount.location.projectId", department: "stockCount.location.departmentId" },
    // Models without project/department FKs are not scopeable
  };

  // Models that are intentionally not scopeable by project/department.
  // These are explicitly listed so that a typo or a new model that hasn't
  // been added to SCOPE_FIELDS doesn't silently fail open (returning
  // unscoped data). If a model is neither in SCOPE_FIELDS nor here,
  // we throw — forcing the developer to decide whether it should be scoped.
  // A build-time test (scope-registry.test.ts) asserts every tenant model
  // (has companyId in schema) is registered one way or the other.
  const KNOWN_UNSCOPABLE = new Set([
    "Task", // assigned to a User, not to a project — not scopeable
    // ── Identity / membership — visibility gated by permission, not scope ──
    "User", "UserCompany", "CustomRole", "UserPreference",
    // ── Org + inventory master data — company-wide catalogues ──
    "Department", "Material", "MaterialCategory", "MaterialLot",
    "StandardConsumption", "Supplier", "Subcontractor", "LandSeller",
    "Customer", "Broker", "ExpenseCategory", "Equipment", "Vehicle",
    "RateContract", "PortalListing",
    // ── Finance ledger + payroll admin — perm-gated, not geographical ──
    "GlAccount", "JournalEntry", "TallySyncLog", "PayrollPeriod",
    // ── Telephony / comms — company-wide infrastructure ──
    "CompanyPhone", "CallLog", "CallTag", "SmsLog", "TelephonyProviderConfig",
    "ConsentPolicy", "BankSms",
    // ── Notifications / system — user-targeted or admin-only ──
    "NotificationTemplate", "NotificationLog", "NotificationPreference",
    "InAppNotification", "PushSubscription",
    // ── Platform internals — never scoped ──
    "AuditLog", "IntegrationConfig", "Workflow", "Upload", "EntityAttachment",
    "Feedback", "ErrorLog", "BackupRecord",
  ]);

  const fields = SCOPE_FIELDS[model];
  if (!fields) {
    if (KNOWN_UNSCOPABLE.has(model)) return baseWhere;
    throw new Error(
      `scopeWhere: unknown model "${model}" — not in SCOPE_FIELDS or KNOWN_UNSCOPABLE. ` +
        "Add it to SCOPE_FIELDS with the correct project/department FK, or to KNOWN_UNSCOPABLE if intentionally unscoped. " +
        "Failing closed to prevent unscoped data access.",
    );
  }

  const filter: Record<string, unknown> = {};

  const buildFieldFilter = (fieldSpec: string | string[], ids: string[]) => {
    const specs = Array.isArray(fieldSpec) ? fieldSpec : [fieldSpec];
    const clauses = specs.map((spec) => {
      const parts = spec.split(".");
      if (parts.length > 1) {
        // Nested relation filter — supports arbitrary depth
        // ("employee.departmentId", "stockCount.location.projectId").
        let clause: Record<string, unknown> = { [parts.at(-1)!]: { in: ids } };
        for (let i = parts.length - 2; i >= 0; i--) clause = { [parts[i]!]: clause };
        return clause;
      }
      return { [spec]: { in: ids } };
    });
    return clauses.length === 1 ? clauses[0]! : { OR: clauses };
  };

  // A scoped user with an empty assignment list must see ZERO scoped rows —
  // skipping the filter when the id list is empty fails open to company-wide
  // visibility (e.g. a freshly-added SITE_ENGINEER saw every project in lists
  // while single-record reads 404'd).
  const denyAll = { ...baseWhere, id: { in: [] as string[] } };

  if (scope.scopeType === "DEPARTMENT") {
    if (fields.department) {
      if (scope.departmentIds.length === 0) return denyAll;
      Object.assign(filter, buildFieldFilter(fields.department, scope.departmentIds));
    } else if (fields.project) {
      // The model isn't department-addressable — fall back to the projects
      // visible through the department's deployed employees (same inference
      // getAssignedProjectIds/canAccessProject use) so list and record
      // access stay consistent.
      const effective = await getAssignedProjectIds();
      if (!effective || effective.length === 0) return denyAll;
      Object.assign(filter, buildFieldFilter(fields.project, effective));
    }
  } else if (scope.scopeType === "PROJECT" && fields.project) {
    // Effective ids = UserScope entries when present, else legacy
    // projectAssignment rows — the same set canAccessProject checks.
    const effective = await getAssignedProjectIds();
    if (!effective || effective.length === 0) return denyAll;
    Object.assign(filter, buildFieldFilter(fields.project, effective));
  }

  // Merge scope filter with the base where clause
  return { ...baseWhere, ...filter };
}

/**
 * Check if the current viewer can access a specific entity.
 * Uses the same scope logic as scopeWhere but for a single record.
 * Returns true if the viewer's scope includes the entity.
 */
export async function canAccessEntity(
  model: string,
  entity: { departmentId?: string | null; projectId?: string | null; activeProjectId?: string | null },
): Promise<boolean> {
  const scope = await getUserScope();
  if (scope.scopeType === "COMPANY") return true;

  if (scope.scopeType === "DEPARTMENT") {
    if (scope.departmentIds.length === 0) return false; // scoped but nothing assigned
    if (entity.departmentId) return scope.departmentIds.includes(entity.departmentId);
    // Entity isn't department-addressable — fall back to the dept's projects
    // (same inference as scopeWhere/getAssignedProjectIds).
    const projId = entity.projectId ?? entity.activeProjectId;
    if (!projId) return false;
    const effective = await getAssignedProjectIds();
    return !!effective && effective.includes(projId);
  }

  if (scope.scopeType === "PROJECT") {
    // Effective ids = UserScope entries when present, else legacy
    // projectAssignment rows — the same set canAccessProject checks.
    const effective = await getAssignedProjectIds();
    if (!effective || effective.length === 0) return false;
    const projId = entity.projectId ?? entity.activeProjectId;
    if (!projId) return false;
    return effective.includes(projId);
  }

  return true;
}

/**
 * Employee access scope — determines what the current viewer can see
 * and manage in the employee directory. This is the ROOT-LEVEL filter:
 * the server uses this to decide which employees to query, which fields
 * to include, and which actions to allow. The client never receives data
 * it shouldn't see.
 *
 * Returns:
 *   - employeeFilter: Prisma where-clause for the Employee query
 *   - canSeeBankDetails: bank account fields
 *   - canSeePayroll: payroll history + salary components
 *   - canSeePersonalDocs: PAN, Aadhaar, PF, ESI, UAN
 *   - canSeeSigningTokens: contract/offer public-signing bearer tokens
 *     (hr.manage ONLY — a payroll/finance manager may see the contract's
 *     status and bank details but must never hold the signing link itself)
 *   - canSeeAccessInfo: user role, phone verification status
 *   - canManageEmployee: can edit profile, onboarding, documents
 *   - canManageAccess: can assign roles, permissions, scope
 *   - canManagePayroll: can mark as paid, edit salary
 *
 * FIELD TIER DEFINITIONS live in @/lib/employee-visibility — which columns
 * belong to each of these flags. Never serialize a raw Employee row; pass it
 * through pickEmployeeRoster()/redactEmployeeRow() from that module.
 */
export async function getEmployeeAccessScope() {
  const role = await getUserRole();
  const scope = await getUserScope();
  const perms = await getUserPermissions();

  const hasPerm = (p: string) => perms.includes(p);

  // ── Visibility filter: which employees can the viewer see? ──
  // Uses the global scopeWhere helper — same logic for all models.
  const employeeFilter = await scopeWhere("Employee", {});

  // ── Field visibility: which fields can the viewer see? ──
  // Bank details, Aadhaar/PAN and address → only the hr.sensitive permission
  const canSeeBankDetails = hasPerm("hr.sensitive");
  // payroll.view is the read-only comp tier by design — its holders (finance,
  // accountants, payroll auditors) already read actual per-employee net pay
  // via /api/payroll lines, so wage fields must not sit behind a stricter gate.
  const canSeePayroll = hasPerm("payroll.view") || hasPerm("payroll.manage") || hasPerm("hr.manage");
  const canSeePersonalDocs = hasPerm("hr.sensitive");
  // Signing tokens are narrower still: they are bearer credentials for the public
  // /accept/* endpoints, so holding one lets anyone sign as the employee. Only
  // hr.signing (HR Manager) may read them.
  const canSeeSigningTokens = hasPerm("hr.signing");
  // Access info (role, phone verification) → only USERS_MANAGE or HR_MANAGE
  const canSeeAccessInfo = hasPerm("users.manage") || hasPerm("hr.manage");

  // ── Management: what can the viewer do? ──
  const canManageEmployee = hasPerm("hr.manage");
  const canManageAccess = hasPerm("users.manage");
  const canManagePayroll = hasPerm("payroll.manage");
  const canManageOnboarding = hasPerm("hr.manage");

  return {
    role,
    employeeFilter,
    canSeeBankDetails,
    canSeePayroll,
    canSeePersonalDocs,
    canSeeSigningTokens,
    canSeeAccessInfo,
    canManageEmployee,
    canManageAccess,
    canManagePayroll,
    canManageOnboarding,
    scopeType: scope.scopeType,
    departmentIds: scope.departmentIds,
  };
}

/**
 * ───────────────────────────────────────────────────────────────
 *  ACTION PERMISSIONS — scope-aware action gating
 * ───────────────────────────────────────────────────────────────
 * Combines permission + scope + hierarchy into a single object
 * that pages use to gate FABs, buttons, action menus, and forms.
 *
 * The server computes this once, passes it to the client as flags.
 * The client never decides on its own whether an action is allowed —
 * it only renders what the server says it can.
 *
 * For create actions (FABs):
 *   canCreateEmployee = hasPerm(HR_MANAGE) AND scope allows creation
 *   (COMPANY scope → yes; DEPARTMENT scope → yes, but form restricts
 *   dept to their depts; PROJECT scope → yes, but form restricts
 *   project to their projects)
 *
 * For form options:
 *   allowedDepartmentIds = [] (COMPANY) or scope.departmentIds (DEPARTMENT)
 *   allowedProjectIds = [] (COMPANY) or scope.projectIds (PROJECT)
 *   The form uses these to filter its dropdowns.
 *
 * For entity-specific actions (edit, delete, mark-paid):
 *   Use canManageSpecificEmployee() which already checks hierarchy.
 *   Scope is already enforced by the query filter — if the viewer
 *   can't see the employee, they can't even get to the detail page.
 */
export async function getActionPermissions() {
  const role = await getUserRole();
  const scope = await getUserScope();
  // Effective = global ∪ scoped-role perms — a Site One PM hat grants
  // create-FABs inside its own scope. Org-scoped flags (canCreateProject,
  // canCreateCompany, canCreateStockLocation, canCreateEmployee) check
  // GLOBAL perms + scopeType === "COMPANY" — their POSTs stay on
  // requirePermission, so the button must hide whenever the POST would 403.
  const perms = await getEffectivePermissions();
  const globalPerms = await getUserPermissions();
  const hasPerm = (p: string) => perms.includes(p);
  const hasGlobalPerm = (p: string) => globalPerms.includes(p);

  // ── Create permissions (FABs) ──
  // A viewer can create if they have the permission AND their scope
  // allows it. COMPANY scope = unrestricted. DEPARTMENT/PROJECT scope
  // = can create, but the form must restrict the target to their scope.
  const canCreateEmployee = hasGlobalPerm("hr.manage");
  const canRecordLeave = hasPerm("hr.manage");
  const canCreateMaterial = hasPerm("inventory.manage");
  const canCreateWorkOrder = hasPerm("assets.manage"); // POST: assets.manage
  const canCreateProject = hasGlobalPerm("projects.manage") && scope.scopeType === "COMPANY";
  const canCreateCompany = hasGlobalPerm("company.manage") && scope.scopeType === "COMPANY";
  const canCreateDepartment = hasGlobalPerm("company.manage");
  const canCreateCustomer = hasPerm("sales.manage");
  const canCreateLead = hasPerm("sales.manage");
  const canCreateSupplier = hasPerm("procurement.manage");
  const canCreateEquipment = hasPerm("assets.manage"); // POST: assets.manage
  const canCreateMaterialSale = hasPerm("sale.create"); // POST: sale.create
  const canCreateRental = hasPerm("sale.create"); // POST: sale.create (tenancies)
  const canCreateGatePass = hasPerm("gate_pass.create"); // POST: gate_pass.create
  const canCreateChangeOrder = hasPerm("wo.manage"); // POST: wo.manage
  const canCreateBoq = hasPerm("projects.manage");
  const canCreateWbs = hasPerm("projects.manage");
  const canCreateNcr = hasPerm("projects.manage") || hasPerm("inventory.manage");
  const canCreateLand = hasPerm("assets.manage");
  const canCreatePortalListing = hasPerm("sales.manage");
  const canCreatePayroll = hasPerm("payroll.manage") || hasPerm("hr.manage");
  const canCreateTeamMember = hasGlobalPerm("company.manage");
  const canCreateBuiltUnit = hasPerm("projects.manage");
  const canCreateSms = hasPerm("sale.create"); // POST: sale.create
  // ── Additional action flags for complete FAB gating ──
  const canCreateVehicle = hasPerm("vehicle.manage"); // POST: vehicle.manage
  const canCreateStockLocation = hasGlobalPerm("inventory.manage") && scope.scopeType === "COMPANY";
  const canCreateStandardConsumption = hasPerm("inventory.manage");
  const canCreateRateContract = hasPerm("procurement.manage"); // POST: procurement.manage
  const canCreateSubcontractor = hasPerm("procurement.manage"); // POST: procurement.manage
  const canCreateBroker = hasPerm("sales.manage");
  const canCreateTask = hasPerm("tasks.assign");
  const canCreateDpr = hasPerm("dpr.submit");
  const canCreateIndent = hasPerm("procurement.manage");
  const canCreatePo = hasPerm("procurement.manage");
  const canCreateQuotation = hasPerm("quotation.manage");
  const canCreateExpense = hasPerm("expense.create");
  const canCreateProjectCost = hasPerm("projectcost.create");
  const canCreateClaim = hasPerm("claim.create");
  const canManagePettyCash = hasPerm("pettycash.manage");
  const canManageSupplierPayment = hasPerm("supplierpayment.manage");
  const canCreateSafetyItem = hasPerm("safety.view");

  // ── Form option restrictions ──
  // When scope is DEPARTMENT, the department dropdown in any create/edit
  // form should only show the viewer's departments. Same for PROJECT scope.
  const restrictDepartments = scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0;
  const restrictProjects = scope.scopeType === "PROJECT" && scope.projectIds.length > 0;
  const allowedDepartmentIds = restrictDepartments ? scope.departmentIds : null; // null = no restriction
  const allowedProjectIds = restrictProjects ? scope.projectIds : null;

  return {
    role,
    scopeType: scope.scopeType,
    canCreateEmployee,
    canRecordLeave,
    canCreateMaterial,
    canCreateWorkOrder,
    canCreateProject,
    canCreateCompany,
    canCreateDepartment,
    canCreateCustomer,
    canCreateLead,
    canCreateSupplier,
    canCreateEquipment,
    canCreateMaterialSale,
    canCreateRental,
    canCreateGatePass,
    canCreateChangeOrder,
    canCreateBoq,
    canCreateWbs,
    canCreateNcr,
    canCreateLand,
    canCreatePortalListing,
    canCreatePayroll,
    canCreateTeamMember,
    canCreateBuiltUnit,
    canCreateSms,
    canCreateVehicle,
    canCreateStockLocation,
    canCreateStandardConsumption,
    canCreateRateContract,
    canCreateSubcontractor,
    canCreateBroker,
    canCreateTask,
    canCreateDpr,
    canCreateIndent,
    canCreatePo,
    canCreateQuotation,
    canCreateExpense,
    canCreateProjectCost,
    canCreateClaim,
    canManagePettyCash,
    canManageSupplierPayment,
    canCreateSafetyItem,
    allowedDepartmentIds,
    allowedProjectIds,
  };
}

/** Type returned by getActionPermissions() — used by client components
 *  that receive the serialized actions object as a prop. */
export type ActionPermissions = Awaited<ReturnType<typeof getActionPermissions>>;

/**
 * Validate that a target department/project is within the current
 * viewer's scope. Throws a 403-style error if not. Used by create/update
 * APIs to prevent scope-escape via direct API calls.
 */
export async function assertScopeAllows(
  target: { departmentId?: string | null; projectId?: string | null },
): Promise<void> {
  const scope = await getUserScope();
  if (scope.scopeType === "COMPANY") return;

  // A scoped user with an empty assignment list must not be able to write —
  // skipping the check when the list is empty fails open to company-wide
  // writes (a freshly-added site engineer could issue stock to ANY project).
  if (scope.scopeType === "DEPARTMENT") {
    if (scope.departmentIds.length === 0) {
      throw new ForbiddenError("You don't have any assigned departments — ask an admin to assign your scope");
    }
    if (target.departmentId) {
      if (!scope.departmentIds.includes(target.departmentId)) {
        throw new ForbiddenError("You can only create/edit within your department");
      }
      return;
    }
    // The target isn't department-addressable — it must be reachable through
    // the department's projects (same inference as scopeWhere).
    if (target.projectId) {
      const effective = await getAssignedProjectIds();
      if (!effective || !effective.includes(target.projectId)) {
        throw new ForbiddenError("You can only create/edit within your department's projects");
      }
      return;
    }
    return; // no scoped target provided — nothing to check against
  }

  if (scope.scopeType === "PROJECT") {
    if (target.projectId) {
      // Effective ids = UserScope entries when present, else legacy
      // projectAssignment rows — the same set canAccessProject checks.
      const effective = await getAssignedProjectIds();
      if (!effective || !effective.includes(target.projectId)) {
        throw new ForbiddenError("You can only create/edit within your project");
      }
      return;
    }
    // A project-scoped user targeting a department-only entity has no valid
    // target — departments aren't reachable through a project scope.
    if (target.departmentId) {
      throw new ForbiddenError("You can only create/edit within your project");
    }
  }
}

/**
 * Filter an array of options (departments/projects) to only those
 * within the viewer's scope. Used by pages to pass restricted option
 * lists to create/edit forms.
 */
export function filterOptionsByScope<T extends { id: string }>(
  options: T[],
  allowedIds: string[] | null,
): T[] {
  if (allowedIds === null) return options; // null = no restriction
  return options.filter((o) => allowedIds.includes(o.id));
}

/**
 * Get scoped form options for a page — departments, projects, and crews
 * filtered by the viewer's scope. This is the systemic fix for Layer C:
 * instead of filtering dropdowns in 136+ client components, filter at the
 * server level before serialization. The client never receives out-of-scope
 * options.
 *
 * Usage in a page loader:
 *   const opts = await getScopedFormOptions();
 *   // opts.departments, opts.projects, opts.crews — all pre-filtered
 *
 * For COMPANY scope, returns all options (no filtering).
 * For DEPARTMENT scope, returns only the viewer's departments + projects
 *   in those departments.
 * For PROJECT scope, returns only the viewer's projects + departments that
 *   contain those projects.
 */
export async function getScopedFormOptions(): Promise<{
  departments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  crews: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  customers: { id: string; name: string }[];
}> {
  const company = await getCompany();
  const scope = await getUserScope();

  // COMPANY scope = no filtering
  if (scope.scopeType === "COMPANY") {
    const [departments, projects, crews, suppliers, customers] = await Promise.all([
      prisma.department.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.crew.findMany({ where: { companyId: company.id, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, projects, crews, suppliers, customers };
  }

  // DEPARTMENT scope: filter departments to viewer's, projects to those depts.
  // Projects don't have a direct departmentId — find projects where employees
  // in the viewer's departments are assigned (via Employee.activeProjectId).
  if (scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0) {
    const departments = await prisma.department.findMany({
      where: { id: { in: scope.departmentIds }, companyId: company.id, deletedAt: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    // Find project IDs from employees in the viewer's departments
    const employeesInDept = await prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, departmentId: { in: scope.departmentIds }, activeProjectId: { not: null } },
      select: { activeProjectId: true }, distinct: ["activeProjectId"],
    });
    const projectIds = employeesInDept.map((e) => e.activeProjectId).filter(Boolean) as string[];
    const projects = projectIds.length > 0
      ? await prisma.project.findMany({ where: { id: { in: projectIds }, companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
    const crews = await prisma.crew.findMany({
      where: { companyId: company.id, active: true, projectId: { in: projectIds.length > 0 ? projectIds : ["__none__"] } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    // Suppliers and customers are company-level, not department-scoped
    const [suppliers, customers] = await Promise.all([
      prisma.supplier.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, projects, crews, suppliers, customers };
  }

  // PROJECT scope: filter projects to viewer's, departments from employees in those projects
  if (scope.scopeType === "PROJECT" && scope.projectIds.length > 0) {
    const projects = await prisma.project.findMany({
      where: { id: { in: scope.projectIds }, companyId: company.id, deletedAt: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    // Find department IDs from employees in the viewer's projects
    const employeesInProj = await prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, activeProjectId: { in: scope.projectIds }, departmentId: { not: null } },
      select: { departmentId: true }, distinct: ["departmentId"],
    });
    const deptIds = [...new Set(employeesInProj.map((e) => e.departmentId).filter(Boolean))] as string[];
    const departments = deptIds.length > 0
      ? await prisma.department.findMany({ where: { id: { in: deptIds }, companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
    const crews = await prisma.crew.findMany({
      where: { companyId: company.id, active: true, projectId: { in: scope.projectIds } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    const [suppliers, customers] = await Promise.all([
      prisma.supplier.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, projects, crews, suppliers, customers };
  }

  // Fallback (shouldn't happen)
  return { departments: [], projects: [], crews: [], suppliers: [], customers: [] };
}

/**
 * Is the current viewer "top of house"? True when their WORN hat is
 * OWNER/ADMIN or their linked Employee record is hierarchyLevel 1.
 *
 * H1 employee records (owner/admin dossiers — salary, documents,
 * onboarding state) are private to top-level viewers: invisible in
 * rosters, onboarding queues and detail pages for everyone else, and
 * unmanageable by anyone below the top. Below H1 (levels 2–6) hierarchy
 * level does NOT gate management — HR staff onboard and manage employees
 * at any level; the role-tier check in canManageSpecificEmployee still
 * protects linked accounts.
 */
export async function isTopLevelViewer(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true; // dev-bypass sees everything
  // The WORN hat decides — an OWNER acting as SITE_ENGINEER previews the
  // staff experience and must not see H1 records while wearing it.
  const worn = await getOwnRole();
  if (worn === "OWNER" || worn === "ADMIN") return true;
  const company = await getCompany();
  const viewerEmployee = await prisma.employee.findFirst({
    where: { userId: user.id, companyId: company.id, deletedAt: null },
    select: { hierarchyLevel: true },
  }).catch(() => null);
  return viewerEmployee?.hierarchyLevel === 1;
}

/**
 * Prisma `where` fragment that hides H1 employee records from non-top
 * viewers. Merge alongside scopeWhere in employee list/detail queries:
 *   where: { ...await scopeWhere("Employee"), ...await employeeVisibilityWhere() }
 */
export async function employeeVisibilityWhere(): Promise<Prisma.EmployeeWhereInput> {
  // NULL-safe: `NOT: { hierarchyLevel: 1 }` would also drop employees whose
  // level is NULL (SQL NULL semantics — NOT(NULL=1) ≠ true). Unleveled
  // employees are ordinary staff, not protected — they must stay visible.
  return (await isTopLevelViewer())
    ? {}
    : { OR: [{ hierarchyLevel: null }, { hierarchyLevel: { not: 1 } }] };
}

/**
 * Check if the current viewer can manage a specific employee.
 * Combines the access scope with the H1 wall: H1 records are only
 * manageable by top-level viewers. Returns false for self-management
 * (can't edit your own profile via the employee page).
 */
export async function canManageSpecificEmployee(
  employee: { userId: string | null; user?: { role: string | null } | null; hierarchyLevel?: number | null },
  viewerUserId: string,
): Promise<boolean> {
  const scope = await getEmployeeAccessScope();
  if (!scope.canManageEmployee) return false;

  // Self-edit blocked
  if (employee.userId && employee.userId === viewerUserId) return false;

  // ── H1 wall — owner/admin dossiers are untouchable below the top ──
  if (employee.hierarchyLevel === 1 && !(await isTopLevelViewer())) return false;

  // No linked user → can manage (field worker without login). Levels 2–6
  // carry no management gate — the H1 wall above is the only level check.
  if (!employee.userId || !employee.user?.role) return true;

  const company = await getCompany();
  const { prisma } = await import("@nirman/db");

  // Hierarchy check: viewer must be above the employee's role.
  // Use the acting role (custom-role viewers act at their baseRole's tier,
  // not the normalized SUPERVISOR fallback getUserRole() would report) and
  // resolve custom TARGET roles via their DB tier — never feed a CUSTOM_*
  // string to canAssignRole(), which normalizes it to SUPERVISOR and
  // silently passes the tier check.
  const actingRole = await getActingRole();
  // Multi-role: the target's held set is { primary } ∪ secondaryRoles on
  // their membership. The viewer must be above EVERY held role — a dormant
  // senior hat still protects the target even while a junior hat is worn.
  const targetMembership = await prisma.userCompany
    .findFirst({
      where: { userId: employee.userId!, companyId: company.id },
      select: { role: true, secondaryRoles: true },
    })
    .catch(() => null);
  const heldRoles = [
    ...new Set(
      [employee.user.role, ...(targetMembership ? [targetMembership.role, ...(targetMembership.secondaryRoles ?? [])] : [])]
        .filter((r): r is string => !!r),
    ),
  ];
  return canManageRoleSet(actingRole, heldRoles, company.id);
}

/**
 * Can an actor at `actorRole` manage/assign `targetRole` — built-in or
 * custom? Custom roles resolve their tier from the CustomRole row in this
 * company; unknown role strings and missing custom roles fail closed.
 *
 * Use this wherever a check involves a stored (possibly CUSTOM_*) role —
 * canAssignRole() alone is unsafe there because normalizeRole() maps any
 * non-built-in string to SUPERVISOR (tier 5), letting every actor at
 * tier 1-4 pass the hierarchy check.
 */
export async function canManageRole(
  actorRole: string | undefined | null,
  targetRole: string | undefined | null,
  companyId: string,
): Promise<boolean> {
  if (!targetRole) return false;
  if (isCustomRole(targetRole)) {
    const customRole = await prisma.customRole.findFirst({
      where: { companyId, key: targetRole },
      select: { tier: true, baseRole: true, permissions: true },
    }).catch(() => null);
    if (!customRole) return false;
    const granted = customRole.baseRole ? effectivePermissions(customRole.baseRole, customRole.permissions) : customRole.permissions;
    return canAssignCustomRole(actorRole, customRole.tier) && canManageOwnerLevelRole(actorRole, granted);
  }
  if (!(ALL_ROLES as string[]).includes(targetRole)) return false;
  return canAssignRole(actorRole, targetRole);
}

/**
 * Map of "companyId:roleKey" → display label for all custom roles across
 * the given companies. Build once per request/page when rendering a list
 * of stored (possibly CUSTOM_*) role values, then pass to roleDisplayLabel.
 */
export async function getCustomRoleLabels(companyIds: string[]): Promise<Map<string, string>> {
  if (companyIds.length === 0) return new Map();
  const rows = await prisma.customRole.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true, key: true, label: true },
  }).catch(() => [] as { companyId: string; key: string; label: string }[]);
  return new Map(rows.map((r) => [`${r.companyId}:${r.key}`, r.label]));
}

/**
 * Display label for any stored role key — custom role label → built-in
 * ROLES label → prettified key. Never show a raw "CUSTOM_*" key to a human.
 */
export function roleDisplayLabel(
  roleKey: string | null | undefined,
  companyId?: string,
  customLabels?: Map<string, string> | null,
): string {
  if (!roleKey) return "Member";
  const custom = companyId ? customLabels?.get(`${companyId}:${roleKey}`) : undefined;
  if (custom) return custom;
  const builtIn = ROLES[roleKey as keyof typeof ROLES];
  if (builtIn) return builtIn.label;
  return prettifyRoleKey(roleKey);
}

/**
 * Assert that the current viewer can manage a specific employee (by ID).
 * Fetches the employee, checks hierarchy + role tier, and throws 403 if not.
 * Use this at the top of any employee mutation route (salary, phone, contract,
 * onboarding, etc.) to enforce hierarchy at the API level.
 */
export async function assertCanManageEmployee(employeeId: string, companyId: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return; // dev-bypass
  const { prisma } = await import("@nirman/db");
  // Apply scopeWhere so department/project-scoped viewers cannot manage
  // employees outside their scope — even if hierarchy would allow it.
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null, ...await scopeWhere("Employee") },
    select: { userId: true, hierarchyLevel: true, user: { select: { role: true } } },
  });
  if (!employee) throw new Error("Employee not found or out of scope");
  const canEdit = await canManageSpecificEmployee(
    { userId: employee.userId, user: employee.user ? { role: employee.user.role } : null, hierarchyLevel: employee.hierarchyLevel },
    currentUser.id,
  );
  if (!canEdit) {
    throw new Error("You cannot manage this employee (hierarchy or role restriction)");
  }
}

/**
 * Get the current user's effective permission list (role matrix +
 * any additive RolePermission overrides from the DB + per-user
 * UserPermission overrides). Memoized per request via AsyncLocalStorage
 * so repeated requirePermission() calls within one request share a single
 * DB round-trip.
 */
/**
 * The member's held role set + the hat currently worn.
 *
 * Multi-role model ("one hat at a time"): a membership holds
 * { role } ∪ secondaryRoles, and `activeRole` selects which single hat
 * drives all authority resolution. NULL or stale activeRole (a hat revoked
 * after it was worn) falls back to the primary role — resolvers can rely on
 * the returned activeRole always being a member of heldRoles.
 *
 * Returns null when the user has no membership in the company.
 */
export async function getHeldRoles(
  userId: string,
  companyId: string,
): Promise<{ primaryRole: string; activeRole: string; heldRoles: string[] } | null> {
  const m = await prisma.userCompany
    .findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, activeRole: true, secondaryRoles: true, active: true },
    })
    .catch(() => null);
  // A deactivated membership (terminated member, pre-rehire) holds no hats —
  // report it exactly like a missing membership so callers fall back safely.
  if (!m || m.active === false) return null;
  const heldRoles = [...new Set([m.role, ...(m.secondaryRoles ?? [])])];
  const activeRole = m.activeRole && heldRoles.includes(m.activeRole) ? m.activeRole : m.role;
  return { primaryRole: m.role, activeRole, heldRoles };
}

/**
 * Can the actor manage a target who holds the given role set? The actor
 * must be above EVERY held role — otherwise a junior manager could edit a
 * target while a dormant senior hat protects them. Resolves custom-role
 * tiers via canManageRole (fails closed on unknown strings).
 */
export async function canManageRoleSet(
  actorRole: string | undefined | null,
  heldRoles: string[],
  companyId: string,
): Promise<boolean> {
  for (const r of heldRoles) {
    if (!(await canManageRole(actorRole, r, companyId))) return false;
  }
  return true;
}

/**
 * Resolve the permission list for a role within a company — built-in or
 * custom — including RolePermission row overrides and extra grants.
 */
export async function resolveRolePermissions(
  role: string,
  companyId: string,
  extraPerms: string[],
): Promise<string[]> {
  const roleOverrides = await prisma.rolePermission
    .findMany({ where: { role }, select: { permission: true } })
    .then((rows) => rows.map((r) => r.permission))
    .catch(() => [] as string[]);

  if (isCustomRole(role)) {
    const customRole = await prisma.customRole
      .findFirst({ where: { companyId, key: role } })
      .catch(() => null);
    if (customRole) {
      if (customRole.baseRole) {
        // Inherit mode: base role's matrix + additive extras.
        return effectivePermissions(customRole.baseRole, [
          ...customRole.permissions,
          ...roleOverrides,
          ...extraPerms,
        ]);
      }
      // Scratch mode: permissions IS the complete set — no base floor.
      // RolePermission overrides + member extras still apply on top.
      const set = new Set([...customRole.permissions, ...roleOverrides, ...extraPerms]);
      return ALL_PERMISSIONS.filter((p) => set.has(p));
    }
    return effectivePermissions("SUPERVISOR", []);
  }
  return effectivePermissions(role, [...roleOverrides, ...extraPerms]);
}

/**
 * An active authority delegation pointing at the current user.
 * While a delegator's delegation is live (delegationEndsAt > now), the
 * delegate acts with the delegator's role authority — permission checks,
 * approval routing ranks and acting-role checks all resolve through
 * getActingRole()/getUserPermissions().
 */
export interface DelegationInfo {
  /** The delegator's UserCompany membership id. */
  membershipId: string;
  /** The delegator's user id — recorded as AuditLog.onBehalfOfId. */
  userId: string;
  name: string;
  role: string;
  endsAt: Date;
}

/**
 * Active delegations where the CURRENT user is the delegate.
 * One level only — a delegate acting for X does not re-delegate X's
 * authority onward. Memoized per request.
 */
export async function getActingDelegations(): Promise<DelegationInfo[]> {
  return memoizeInRequest("actingDelegations", async () => {
    const user = await getCurrentUser();
    if (!user || user.id === "dev") return [];
    const company = await getCompany();
    const membership = await prisma.userCompany
      .findUnique({
        where: { userId_companyId: { userId: user.id, companyId: company.id } },
        select: { id: true },
      })
      .catch(() => null);
    if (!membership) return [];
    const rows = await prisma.userCompany
      .findMany({
        where: {
          companyId: company.id,
          active: true,
          approvalsDelegatedToId: membership.id,
          delegationEndsAt: { gt: new Date() },
        },
        select: {
          id: true,
          role: true,
          delegationEndsAt: true,
          user: { select: { id: true, name: true } },
        },
      })
      .catch(() => [] as never[]);
    return rows.map((r) => ({
      membershipId: r.id,
      userId: r.user.id,
      name: r.user.name,
      role: r.role,
      endsAt: r.delegationEndsAt!,
    }));
  });
}

/**
 * The role the current user ACTS AS for authority checks (approval
 * routing ranks, service-layer actorRole gates). Equals their own role
 * unless an active delegation hands them a higher-authority role.
 * Display/UI should keep using user.role; only authority checks use this.
 */
/**
 * The user's OWN effective role — the membership role with custom roles
 * resolved to their baseRole. Unlike getActingRole(), this ignores
 * delegation: it's the right answer for persona/identity questions
 * ("what surface should this user see") where acting authority must not
 * leak in, while getActingRole() answers authority questions.
 */
export async function getOwnRole(): Promise<Role> {
  const user = await getCurrentUser();
  if (!user) return "SUPERVISOR";
  return memoizeInRequest("ownActingRole", async () => {
    const company = await getCompany().catch(() => null);
    // Multi-role: the worn hat (membership.activeRole, validated against the
    // held set) is the user's own role for authority purposes; NULL/stale
    // falls back to the primary membership role.
    const held = company ? await getHeldRoles(user.id, company.id) : null;
    // Same deactivation guard as getUserRole — a dormant global role must not
    // re-grant authority after every membership has been switched off.
    const rawRole = held?.activeRole ?? (user.active === false ? "SUPERVISOR" : user.role);
    if (isCustomRole(rawRole) && company) {
      const resolved = await resolveCustomAuthorityRole(company.id, rawRole);
      if (resolved) return resolved;
    }
    return normalizeRole(rawRole);
  });
}

export async function getActingRole(): Promise<Role> {
  const user = await getCurrentUser();
  if (!user) return "SUPERVISOR";
  // The user's own authority comes from their membership role — which may be
  // a custom role (CUSTOM_*). Custom roles act with their baseRole's
  // authority for tier-based checks (approvals, role management).
  // A delegation never changes this: permissions come from getUserPermissions,
  // which adds only the delegated approval permissions.
  return getOwnRole();
}

/**
 * Approval rank for purchase orders. An owner's delegate approves at ADMIN
 * rank, below the owner threshold. Rank only: never a permission source.
 */
export async function getPoApprovalRole(projectId: string | null): Promise<Role> {
  const user = await getCurrentUser();
  const company = await getCompany().catch(() => null);
  const raw = await getUserRole();
  let own: Role = isCustomRole(raw) && company
    ? customPoApprovalRole(await resolveRolePermissions(raw, company.id, []))
    : await getActingRole();
  // A project hat only counts while the wearer holds a live membership in the
  // hat's own company — a leftover assignment row (or a deactivated account)
  // must not keep raising their approval rank.
  const assignment = user && projectId && user.active !== false
    ? await prisma.projectAssignment
        .findFirst({
          where: { userId: user.id, projectId },
          select: { scopedRole: true, project: { select: { companyId: true } } },
        })
        .catch(() => null)
    : null;
  if (
    assignment?.scopedRole &&
    !(await membershipDeactivated(user!.id, assignment.project?.companyId)) &&
    roleTier(normalizeRole(assignment.scopedRole)) < roleTier(own)
  ) own = normalizeRole(assignment.scopedRole);
  const delegatorRoles = await Promise.all(
    (await getActingDelegations()).map(async (d) =>
      isCustomRole(d.role) && company ? customPoApprovalRole(await resolveRolePermissions(d.role, company.id, [])) : d.role,
    ),
  );
  return poApprovalRoleFor(own, delegatorRoles);
}

/**
 * Resolve the role the current user acts as *within a specific project*.
 * Their ProjectAssignment.scopedRole says which hat they wear at that site —
 * a SITE_ENGINEER assigned as PROJECT_MANAGER on Site One can approve Site
 * One POs but not Site Two's. Returns the higher-authority of (acting role,
 * scopedRole for this project), or null when the user has no assignment.
 */
/**
 * Permissions granted by the user's project assignments' scopedRoles.
 * The queue already scope-filters its items, so a scoped-PM's PO_APPROVE
 * only applies to their projects' rows — the "where" stays bounded even
 * though the permission looks global in the response.
 */
export async function getScopedRolePermissions(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user || user.active === false) return [];
  const company = await getCompany().catch(() => null);
  if (!company) return [];
  if (await membershipDeactivated(user.id, company.id)) return [];
  const assignments = await prisma.projectAssignment
    .findMany({ where: { userId: user.id, project: { companyId: company.id } }, select: { scopedRole: true } })
    .catch(() => [] as { scopedRole: string }[]);
  if (assignments.length === 0) return [];
  const perms = new Set<string>();
  for (const a of assignments) {
    for (const p of effectivePermissions(normalizeRole(a.scopedRole), [])) perms.add(p);
  }
  return [...perms];
}

async function membershipDeactivated(userId: string, companyId: string | undefined): Promise<boolean> {
  if (!companyId) return false;
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { active: true },
  });
  return membership?.active === false;
}

/**
 * Permissions the user holds on one project: their global list plus the
 * built-in role of their project assignment there. A scoped hat never goes
 * through the tier stand-in, so a custom role gets nothing from one.
 */
export async function getPermissionsForProject(projectId: string | null): Promise<string[]> {
  const globalPerms = await getUserPermissions();
  const user = await getCurrentUser();
  if (!projectId || !user || user.active === false) return globalPerms;
  const company = await getCompany();
  if (await membershipDeactivated(user.id, company.id)) return [];
  const assignment = await prisma.projectAssignment
    .findFirst({ where: { userId: user.id, projectId }, select: { scopedRole: true } })
    .catch(() => null);
  return permissionsWithScopedRole(globalPerms, assignment?.scopedRole);
}

export async function getActingRoleForProject(projectId: string | null): Promise<Role | null> {
  if (!projectId) return null;
  const user = await getCurrentUser();
  if (!user || user.active === false) return null;
  const assignment = await prisma.projectAssignment
    .findFirst({
      where: { userId: user.id, projectId },
      select: { scopedRole: true, project: { select: { companyId: true } } },
    })
    .catch(() => null);
  if (!assignment?.scopedRole) return null;
  // The hat dies with the membership in the hat's company — a leftover
  // assignment must not keep conferring the role on a terminated member.
  if (await membershipDeactivated(user.id, assignment.project?.companyId)) return null;
  const scoped = normalizeRole(assignment.scopedRole);
  const base = await getActingRole();
  return roleTier(scoped) < roleTier(base) ? scoped : base;
}

/**
 * Canonical built-in stand-in per tier — used to collapse a custom role
 * into an equivalent-authority built-in for tier-based checks. Tier is the
 * ONLY thing the answer feeds (roleTier downstream), so the specific
 * built-in chosen per tier just needs to sit at that level.
 */
const TIER_TO_AUTHORITY_ROLE: Record<number, Role> = {
  1: "ADMIN", // tier-1 custom roles can't be created; defensive fallback
  2: "FINANCE_HEAD",
  3: "PROJECT_MANAGER",
  4: "SITE_ENGINEER",
  5: "SUPERVISOR",
};

/**
 * Resolve a custom role to a built-in carrying its authority. Inherit mode
 * returns the baseRole unchanged when the declared tier matches it (the
 * base is the honest answer — persona/domain preserved); scratch roles and
 * tier overrides return the canonical built-in at the declared tier, since
 * the tier — not the base — is what downstream checks consume.
 */
export async function resolveCustomAuthorityRole(companyId: string, rawRole: string): Promise<Role | null> {
  const customRole = await prisma.customRole
    .findFirst({ where: { companyId, key: rawRole }, select: { baseRole: true, tier: true } })
    .catch(() => null);
  if (!customRole) return null;
  const base = normalizeRole(customRole.baseRole);
  if (customRole.baseRole && customRole.tier === roleTier(base)) return base;
  return TIER_TO_AUTHORITY_ROLE[customRole.tier] ?? "SUPERVISOR";
}

/**
 * Permissions the user actually holds right now, including the project-scoped
 * role hats from ProjectAssignment. Use for PAGE-GATE decisions only on
 * surfaces whose queries are scopeWhere-filtered — a scoped PM's FINANCE_VIEW
 * hat must not open the org-wide GL. Server-side auth still goes through
 * requirePermission/scopeWhere per record; this is for the UI gate.
 */
export async function getEffectivePermissions(): Promise<string[]> {
  const [globalPerms, scopedPerms] = await Promise.all([
    getUserPermissions(),
    getScopedRolePermissions(),
  ]);
  return [...new Set([...globalPerms, ...scopedPerms])];
}

export async function getUserPermissions(): Promise<string[]> {
  return memoizeInRequest("permissions", async () => {
  const user = await getCurrentUser();
  if (!user) return [];
  // A deactivated account holds no permissions even where memberships remain
  // marked active (suspend path) — never let the role matrix re-arm it.
  if (user.active === false) return [];
  const company = await getCompany();

  const userMembership = await prisma.userCompany
    .findUnique({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      include: { userPermissions: { select: { permission: true } } },
    })
    .catch(() => null);
  const userOverrides = userMembership?.userPermissions.map((p) => p.permission) ?? [];
  if (userMembership?.active === false) return [];

  // Resolve via the membership's ACTIVE role (raw, per-company) — NOT
  // user.role, which getCurrentUser() normalizes to a built-in role,
  // collapsing custom roles (CUSTOM_*) to SUPERVISOR before resolution.
  // Multi-role: the worn hat (activeRole) drives permissions; a stale hat
  // falls back to the primary role.
  const wornHat =
    userMembership?.activeRole &&
    [userMembership.role, ...(userMembership.secondaryRoles ?? [])].includes(userMembership.activeRole)
      ? userMembership.activeRole
      : userMembership?.role;
  const ownPerms = await resolveRolePermissions(wornHat ?? user.role, company.id, userOverrides);

  // ── Delegation: while an active delegation targets this user, they gain the
  // delegator's APPROVAL permissions only — never administration or payroll. ──
  const delegations = await getActingDelegations();
  if (delegations.length === 0) return ownPerms;
  return [...new Set([...ownPerms, ...delegableApprovalPermissions()])];
  });
}

/**
 * Identity payload for the nav shells (desktop AppShell + mobile
 * MobileShellV2). Resolved once per request in the root layout so the
 * nav renders with the real role/permissions/company on first paint —
 * no client-side /api/me + /api/company waterfall after hydration.
 *
 * `me` matches the /api/me response shape and `company` matches
 * /api/company, so both can seed SWR's `fallback` cache directly — every
 * client consumer (AppShell, usePermissions, page hooks) starts with
 * real data instead of a least-privileged placeholder.
 */
export interface NavBootstrap {
  me: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    ownRole: string;
    permissions: string[];
    /** Permissions from project-scoped role hats — nav consults them only
     *  for routes marked scopeAware. */
    scopedPermissions: string[];
    /** Membership scope — topology create-flags gate on this. */
    scopeType: "COMPANY" | "DEPARTMENT" | "PROJECT" | "NONE";
    /** Multi-role: all hats the member holds (primary + secondary). */
    roles: string[];
    /** Multi-role: the hat currently worn (equals `role` when no switch). */
    activeRole: string;
    /** Multi-role: display label per held role key. */
    roleLabels: Record<string, string>;
  };
  company: {
    id: string;
    name: string;
    currency: string;
    gstin: string | null;
    pan: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    businessType: string | null;
    parentCompanyId: string | null;
    companies: {
      id: string;
      name: string;
      businessType: string | null;
      parentName: string | null;
      parentCompanyId: string | null;
      isCurrent: boolean;
    }[];
  };
}

/**
 * Resolve the nav identity for the current request, or null when there is
 * no authenticated session (public routes — the client auth guard handles
 * the redirect). Memoized per request: the root layout's call and the /m
 * layout's call share one computation when the ALS context propagates.
 */
export async function getNavBootstrap(): Promise<NavBootstrap | null> {
  const run = () =>
    memoizeInRequest("navBootstrap", async () => {
      const user = await getCurrentUser();
      if (!user) return null;

      const [company, permissions, scopedPermissions, ownRole, scope] = await Promise.all([
        getCompany(),
        getUserPermissions(),
        getScopedRolePermissions(),
        getOwnRole(),
        getUserScope(),
      ]);
      const held = await getHeldRoles(user.id, company.id);
      // Multi-role: display labels for every held hat (custom roles resolve
      // via their CustomRole row in this company).
      const customLabels = await getCustomRoleLabels([company.id]).catch(() => new Map<string, string>());
      const roleLabels = Object.fromEntries(
        (held?.heldRoles ?? [user.role]).map((r) => [r, roleDisplayLabel(r, company.id, customLabels)]),
      );

      // Same visibility rule as GET /api/company: only companies the user
      // actually belongs to (active membership). OWNER/ADMIN are per-tenant
      // roles — letting them see every company leaked other tenants' names
      // (and IDs) into the switcher. Both switch endpoints re-verify the
      // membership anyway, so a non-member entry could only ever 403.
      const isDevBypass =
        process.env.AUTH_BYPASS === "true" &&
        process.env.NODE_ENV !== "production" &&
        user.id === "dev";
      const visible = await prisma.company.findMany({
        where: {
          deletedAt: null,
          ...(isDevBypass
            ? {}
            : { userMemberships: { some: { userId: user.id, active: true } } }),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          businessType: true,
          parentCompanyId: true,
          parent: { select: { id: true, name: true } },
        },
      });

      return {
        me: {
          id: user.id,
          name: user.name || null,
          email: user.email || null,
          role: user.role,
          ownRole,
          permissions,
          scopedPermissions,
          scopeType: scope.scopeType,
          roles: held?.heldRoles ?? [user.role],
          activeRole: held?.activeRole ?? user.role,
          roleLabels,
        },
        company: {
          id: company.id,
          name: company.name,
          currency: company.currency,
          gstin: company.gstin,
          pan: company.pan,
          address: company.address,
          phone: company.phone,
          email: company.email,
          businessType: company.businessType,
          parentCompanyId: company.parentCompanyId,
          companies: visible.map((c) => ({
            id: c.id,
            name: c.name,
            businessType: c.businessType,
            parentName: c.parent?.name ?? null,
            parentCompanyId: c.parentCompanyId ?? null,
            isCurrent: c.id === company.id,
          })),
        },
      };
    });
  // When no request context is active (called outside apiHandler/layout),
  // create one so the internal getCurrentUser/getCompany/getUserPermissions
  // calls still dedupe among themselves.
  if (!requestContextALS.getStore()) return runWithRequestContext(run);
  return run();
}

/** Error thrown when a permission/role check fails — caught by apiHandler. */
export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden — your role does not have permission for this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Error thrown when no authenticated session is found. */
export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Throw ForbiddenError if the current user lacks the permission.
 * Call inside an apiHandler / route body. Resolves overrides from DB.
 */
export async function requirePermission(permission: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  const perms = await getUserPermissions();
  // OWNER/ADMIN have "*" → effectivePermissions returns ALL_PERMISSIONS,
  // so this also covers superusers.
  if (!perms.includes(permission)) throw new ForbiddenError();
  return user;
}

/**
 * Permission gate for SCOPE-AWARE routes — unions the user's global perms
 * with their ProjectAssignment scopedRole perms. Use ONLY on routes whose
 * every scoped read is scopeWhere-filtered and every write goes through
 * assertScopeAllows on the target — the scoped perm opens the route, and the
 * scope assertion still limits which records the call can touch. A scoped
 * PM's hat must never reach an org-level surface through this gate.
 */
export async function requireEffectivePermission(permission: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  const perms = await getEffectivePermissions();
  if (!perms.includes(permission)) throw new ForbiddenError();
  return user;
}

/**
 * Throw ForbiddenError if the current user's role is not at least the
 * given role (OWNER > ADMIN > MANAGER > SUPERVISOR/SALES/ACCOUNTANT).
 * "At least" here means: the user's role is in the allowed set OR is
 * OWNER/ADMIN (superuser).
 */
export async function requireRole(...allowed: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  // Multi-role: gate on the hat actually worn (activeRole ?? primary).
  // A dormant OWNER hat in the held set does NOT bypass the check —
  // the user must switch hats first (no silent privilege leaks).
  const company = await getCompany().catch(() => null);
  const held = company ? await getHeldRoles(user.id, company.id) : null;
  const effectiveRole = normalizeRole(held?.activeRole ?? user.role);
  if (effectiveRole === "OWNER" || effectiveRole === "ADMIN" || effectiveRole === "DEVELOPER") return user;
  if (!allowed.includes(effectiveRole)) throw new ForbiddenError();
  return user;
}

/** Require the current user to be authenticated (any role). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  return user;
}

/**
 * Throw ForbiddenError if the current user lacks ALL of the given permissions.
 * The user must have at least ONE of the permissions to pass.
 */
export async function requireAnyPermission(...permissions: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  const perms = await getUserPermissions();
  if (perms.includes("*")) return user; // OWNER/ADMIN superuser
  if (!permissions.some((p) => perms.includes(p))) throw new ForbiddenError();
  return user;
}

/** Any-of variant of requireEffectivePermission — scope-aware routes only. */
export async function requireAnyEffectivePermission(...permissions: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  const perms = await getEffectivePermissions();
  if (perms.includes("*")) return user;
  if (!permissions.some((p) => perms.includes(p))) throw new ForbiddenError();
  return user;
}

/**
 * Get the current user's UserCompany membership for the active company.
 * Returns the membership row (with id, role, scopeType, reportsToUserCompanyId)
 * or null if the user has no membership in the current company.
 *
 * In dev-bypass mode with the synthetic "dev" user (no real DB row), this
 * returns null — callers should handle that gracefully (e.g. allow the
 * operation without hierarchy enforcement).
 */
export async function getCurrentUserMembership(): Promise<{
  id: string;
  role: string;
  secondaryRoles: string[];
  activeRole: string | null;
  scopeType: string | null;
  reportsToUserCompanyId: string | null;
} | null> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) return null;
  // The synthetic "dev" user has no real UserCompany row.
  if (user.id === "dev") return null;
  return prisma.userCompany.findFirst({
    where: { userId: user.id, companyId: user.companyId, active: true },
    select: { id: true, role: true, secondaryRoles: true, activeRole: true, scopeType: true, reportsToUserCompanyId: true },
  });
}

// ── Auto-audit (company activity trail) ─────────────────────────────
// Every successful mutation that doesn't carry richer opts.audit
// metadata writes a generic AuditLog entry derived from the request —
// "who did what, where, when" for the OWNER/ADMIN. Routes with
// opts.audit still win (they record semantic before/after payloads).

/** Internal/telemetry/noise endpoints that must never write audit rows. */
const AUTO_AUDIT_SKIP_PREFIXES = [
  "/api/error-logs",
  "/api/audit",
  "/api/activity",
  "/api/notifications",
  "/api/auth",
  "/api/me",
  "/api/health",
  "/api/search",
  "/api/briefing",
  "/api/assistant",
  "/api/mobile",
  "/api/ocr",
  "/api/uploads",
  "/api/telephony",
  "/api/cron",
  "/api/backup",
  "/api/export",
  "/api/reports",
  "/api/tally",
  "/api/e-invoice",
  "/api/feedback",
  "/api/dashboard-counts",
  "/api/persona-home",
  "/api/integrations",
  // Pure helper endpoints — they don't create/modify resources but their POST
  // would otherwise derive fake audit rows ("/api/materials/auto-code" POST →
  // MATERIAL_CREATE, "/api/gl/preview" POST → GL_CREATE, "/api/tally/auto-sync"
  // POST → TALLY_CREATE).
  "/api/materials/auto-code",
  "/api/gl/preview",
  "/api/tally/auto-sync",
];

/** Path segments that read as business actions, not resource ids —
 * mapped to the ACTION_TYPES vocabulary the audit UI filters on. */
const AUTO_AUDIT_ACTION_WORDS = new Set([
  "approve", "reject", "submit", "resubmit", "order", "receive", "cancel",
  "complete", "assign", "return", "retire", "confirm", "reconcile",
  "convert", "partition", "restore", "pay", "dispatch", "deliver",
  "close", "reopen", "finalize", "lock", "unlock", "publish", "send",
  "sync", "generate", "escalate", "extend", "terminate", "activate",
  "deactivate", "verify", "check-in", "check-out", "issue", "transfer",
  "waive-quotes", "select-quote", "unpartition", "split", "merge",
]);

function deriveAutoAudit(pathname: string, method: string): {
  action: string;
  entityType: string;
  entityId: string | null;
} {
  const segments = pathname.split("/").filter(Boolean); // ["api", "purchase-orders", "abc", "approve"]
  const rawEntity = segments[1] ?? "api";
  const entityType =
    rawEntity
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("")
      .replace(/s$/, "") || "Api";

  // Last segment wins as the verb when it's an action word; otherwise the
  // HTTP method maps to CREATE/UPDATE/DELETE.
  const last = segments[segments.length - 1] ?? "";
  const verb = AUTO_AUDIT_ACTION_WORDS.has(last)
    ? last.replace(/-/g, "_").toUpperCase()
    : method === "POST"
      ? "CREATE"
      : method === "DELETE"
        ? "DELETE"
        : "UPDATE";

  // First id-like segment after the entity segment.
  const entityId =
    segments.slice(2).find((s) => /^[A-Za-z0-9_-]{15,}$/.test(s)) ?? null;

  // Canonical action vocabulary is ENTITY_VERB in SCREAMING_SNAKE — convert
  // the title-cased entity ("CustomRole" → "CUSTOM_ROLE") so auto-audit rows
  // read identically to the explicit logAction rows for the same operation.
  const actionEntity = entityType
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();

  return { action: `${actionEntity}_${verb}`, entityType, entityId };
}

/** Read a mutation's response body for the audit `after` payload —
 * bounded, pruned, and never allowed to fail the request. */
async function auditSnapshot(res: Response): Promise<unknown> {
  try {
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > 200_000) return undefined;
    const parsed = await Promise.race([
      res.clone().json(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("audit snapshot timeout")), 1500)),
    ]);
    const prune = (v: unknown, depth: number): unknown => {
      if (depth > 4) return "…";
      if (typeof v === "string") return v.length > 400 ? v.slice(0, 400) + "…" : v;
      if (Array.isArray(v)) return v.slice(0, 20).map((i) => prune(i, depth + 1));
      if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v).slice(0, 40)) {
          if (/photo|image|base64|blob|data:/i.test(k)) { out[k] = "[omitted]"; continue; }
          out[k] = prune(val, depth + 1);
        }
        return out;
      }
      return v;
    };
    return prune(parsed, 0);
  } catch {
    return undefined;
  }
}

/**
 * Wrap an API handler with auth + error handling.
 * Returns 401 if no session is found (unless AUTH_BYPASS is set).
 * Mutations (POST/PATCH/PUT/DELETE) automatically write an AuditLog
 * entry on success — rich semantic entries when `audit` options are
 * provided, otherwise a generic auto-derived entry (entity from path +
 * pruned response body). Internal/noise endpoints are skipped.
 *
 * **Auto-applies rate limiting**: GET → `read` preset, mutations → `write`
 * preset. Override with `{ rateLimit: "heavy" }` or `{ rateLimit: false }`.
 *
 * **Prisma error mapping**: P2024 (pool exhausted) → 503, P1001 (DB
 * unreachable) → 503, P1002 (timeout) → 504 — so the start wrapper / load
 * balancer can retry instead of returning a 500.
 *
 * **Sentry**: 500 errors are captured via `Sentry.captureException`
 * (dynamic import, no-op without `SENTRY_DSN`).
 */
export function apiHandler<TReq extends Request = Request, TCtx = unknown>(
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
  opts: {
    audit?: { action: string; entityType: string; entityIdFrom?: (req: TReq, res: Response) => string | undefined };
    rateLimit?: "read" | "write" | "auth" | "webhook" | "heavy" | false;
    /** Cache tag for server-side caching (GET only). Set to enable. */
    cache?: { tag: string; ttlMs?: number };
    /** Skip session check — for cron/webhook routes that authenticate via secret header. */
    skipSession?: boolean;
  } = {},
) {
  return async (req: Request, ctx: TCtx): Promise<Response> => {
    // ── Backpressure protection ────────────────────────────────
    // If the server is at capacity, reject early with 503 + Retry-After.
    // This prevents request queueing that wastes DB connections + memory.
    const bp = getBackpressureStats();
    if (toNum(bp.activeRequests) >= toNum(bp.maxConcurrency)) {
      return json(
        { error: "Server is busy — please retry shortly", retryable: true },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    }

    // Track active requests for backpressure
    const untrack = trackRequest();
    return runWithRequestContext(async () => {
    try {
        if (!opts.skipSession) {
          const session = await getSession();
          if (!session) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }
          // Central deactivation gate — a session cookie stays valid after an
          // admin deactivates the account, so without this check a terminated
          // user keeps full API access until the session expires. Session-only
          // routes (e.g. /api/me) would otherwise never hit requireUser's
          // active check.
          const gateUser = await getCurrentUser();
          if (!gateUser) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }
          if (!gateUser.active) {
            return json({ error: "Your account is inactive. Contact your administrator." }, { status: 403 });
          }
        }

        // Auto-apply rate limiting (unless explicitly disabled).
        const rlPreset = opts.rateLimit === undefined
          ? (req.method === "GET" ? "read" : "write")
          : opts.rateLimit;
        if (rlPreset) {
          const user = await getCurrentUser();
          const rl = rateLimit(req, RATE_LIMITS[rlPreset], user?.id);
          if (rl) return rl;
        }

        // ── Server-side response cache (GET only) ──────────────
        // Caches the full response in memory for the TTL duration.
        // Subsequent requests within the TTL are served from memory
        // without hitting the DB. Stale-while-revalidate on expiry.
        if (opts.cache && req.method === "GET") {
          const cachedFn = withCache(opts.cache.tag, opts.cache.ttlMs ?? 15_000, fn);
          const res = await cachedFn(req as TReq, ctx);
          // Auto-add Cache-Control header if not already set
          if (!res.headers.has("Cache-Control")) {
            const ttlSec = Math.ceil((opts.cache.ttlMs ?? 15_000) / 1000);
            res.headers.set(
              "Cache-Control",
              `private, max-age=${ttlSec}, stale-while-revalidate=${ttlSec * 4}`,
            );
          }
          return res;
        }

        // ── Idempotent mutations (opt-in via X-Idempotency-Key) ────────────
        // The offline queue sends each op's client id as the key. A retried
        // sync (response lost, double-POST) must NOT re-apply — replay the
        // stored response instead. Durable (DB) so it survives a restart.
        let idemRecord: { id?: string; key: string; userId: string; path: string } | null = null;
        const idemKey = req.method === "POST" ? req.headers.get("x-idempotency-key")?.trim() : null;
        // Hash the request body so a reused key with a DIFFERENT payload is
        // rejected (422) instead of silently replaying the stored response —
        // silent replay would drop the caller's real data while looking like
        // a success. req.clone() reads a copy without consuming the body for
        // the handler.
        let requestHash: string | null = null;
        if (idemKey) {
          const rawBody = await req.clone().text().catch(() => "");
          if (rawBody) {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
            requestHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
          }
          const idemUser = await getCurrentUser();
          const idemUserId = idemUser?.id ?? "anon";
          const pathname = new URL(req.url).pathname;
          // Insert-first-wins: the (key,userId) unique constraint arbitrates
          // concurrent double-fires — the old check-then-store-later order let
          // two in-flight requests both miss `prior` and both write (verified:
          // double expense rows from one client op). status 0 = in-flight.
          const inserted = await prisma.idempotencyKey.create({
            data: { key: idemKey, userId: idemUserId, method: req.method, path: pathname, status: 0, requestHash },
            select: { id: true },
          }).then((row) => row).catch((e: unknown) => {
            if ((e as { code?: string })?.code === "P2002") return null;
            return null; // DB unavailable for the key table — fall through non-idempotent
          });
          if (inserted) {
            idemRecord = { id: inserted.id, key: idemKey, userId: idemUserId, path: pathname };
          } else {
            const prior = await prisma.idempotencyKey.findUnique({
              where: { key_userId: { key: idemKey, userId: idemUserId } },
            }).catch(() => null);
            if (prior) {
              // Same key + different body = the caller is reusing a key for a
              // different intent — reject loudly instead of replaying the wrong
              // response. (Legacy rows have no requestHash — treat as replayable
              // for backward compatibility.)
              if (prior.requestHash && requestHash && prior.requestHash !== requestHash) {
                return json(
                  { error: "Idempotency key was already used with a different request body." },
                  { status: 422 },
                );
              }
              // status 0 = another same-key request is still in flight. If the
              // placeholder is older than 60s the writer died mid-flight —
              // reclaim the key so a real retry can proceed.
              if (prior.status === 0) {
                const stale = prior.createdAt.getTime() < Date.now() - 60_000;
                if (stale) {
                  await prisma.idempotencyKey.delete({ where: { id: prior.id } }).catch(() => {});
                  const reclaimed = await prisma.idempotencyKey.create({
                    data: { key: idemKey, userId: idemUserId, method: req.method, path: pathname, status: 0, requestHash },
                    select: { id: true },
                  }).catch(() => null);
                  if (reclaimed) idemRecord = { id: reclaimed.id, key: idemKey, userId: idemUserId, path: pathname };
                } else {
                  return json(
                    { error: "Request with this idempotency key is already in flight — retry in a moment." },
                    { status: 409, headers: { "Retry-After": "1" } },
                  );
                }
              } else {
                return json(
                  prior.responseBody ? JSON.parse(prior.responseBody) : { ok: true, replayed: true },
                  { status: prior.status, headers: { "X-Idempotent-Replay": "true" } },
                );
              }
            }
          }
        }

        const requestStartAt = new Date();

        // Null-body guard (global): `JSON.parse("null")` yields null, then
        // `body.field` / `const {x} = body` throws a TypeError → 500 in every
        // route that reads fields without a zod schema (~200 sites). Wrap
        // req.json once so a literal `null` body is a clean 400 everywhere —
        // the real crash class the fuzz sweep kept surfacing. Malformed JSON
        // still throws SyntaxError → 400 via the existing mapping; array/
        // string roots pass through (handlers already validate those).
        const rawJson = (req as Request).json.bind(req);
        (req as Request).json = async () => {
          const v = await rawJson();
          if (v === null) throw new ServiceError("Request body must be a JSON object", 400);
          return v;
        };

        const res = await fn(req as TReq, ctx);

        // Store the success body on the claimed key row so a retried request
        // replays instead of re-applying. On a non-2xx the placeholder is
        // deleted — a legit retry after a real failure must go through.
        if (idemRecord?.id) {
          if (res.status >= 200 && res.status < 300) {
            const bodyText = await res.clone().text().catch(() => null);
            await prisma.idempotencyKey.update({
              where: { id: idemRecord.id },
              data: bodyText != null && bodyText.length < 100_000
                ? { status: res.status, responseBody: bodyText }
                : { status: res.status },
            }).catch(() => {});
          } else {
            await prisma.idempotencyKey.delete({ where: { id: idemRecord.id } }).catch(() => {});
          }
        }

        // ── Auto-add Cache-Control to GET responses ────────────
        // If the handler didn't set a Cache-Control header, add a
        // conservative default for GET requests (5s client cache +
        // 20s stale-while-revalidate). This lets the browser serve
        // repeated navigations from cache without re-fetching.
        if (req.method === "GET" && !res.headers.has("Cache-Control") && res.status >= 200 && res.status < 300) {
          res.headers.set(
            "Cache-Control",
            "private, max-age=5, stale-while-revalidate=20",
          );
        }

        // Best-effort audit logging for mutations
        const isMutation = req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE";
        if (isMutation) {
          try {
            const user = await getCurrentUser();
            // Acting under someone's delegation? Record it on the audit row.
            const delegations = user ? await getActingDelegations() : [];
            const onBehalfOfId = delegations[0]?.userId ?? undefined;
            const pathname = new URL(req.url).pathname;
            if (opts.audit) {
              const entityId = opts.audit.entityIdFrom?.(req as TReq, res);
              if (entityId) {
                await logAction(prisma, {
                  userId: user?.id,
                  companyId: user?.companyId ?? undefined,
                  action: opts.audit.action,
                  entityType: opts.audit.entityType,
                  entityId,
                  onBehalfOfId,
                });
              }
            } else if (
              res.status < 400 &&
              !opts.skipSession &&
              !AUTO_AUDIT_SKIP_PREFIXES.some((p) => pathname.startsWith(p))
            ) {
              // Skip the generic row when the handler already wrote a
              // semantic audit row during this request (service-layer
              // logAction) — otherwise every mutation shows up twice in
              // the activity feed (USER_ROLE_CHANGE + USER_UPDATE).
              // The 5s skew buffer covers app/DB clock drift.
              const alreadyLogged = user?.id
                ? await prisma.auditLog.findFirst({
                    where: {
                      userId: user.id,
                      timestamp: { gte: new Date(requestStartAt.getTime() - 5000) },
                    },
                    select: { id: true },
                  })
                : null;
              if (!alreadyLogged) {
                const derived = deriveAutoAudit(pathname, req.method);
                const after = await auditSnapshot(res);
                const entityId =
                  derived.entityId ??
                  (after && typeof after === "object" && "id" in after
                    ? String((after as { id: unknown }).id)
                    : "(collection)");
                await logAction(prisma, {
                  userId: user?.id,
                  companyId: user?.companyId ?? undefined,
                  action: derived.action,
                  entityType: derived.entityType,
                  entityId,
                  after,
                  onBehalfOfId,
                });
              }
            }
          } catch {
            // audit failure must never break the response
          }
        }
        return res;
    } catch (err: unknown) {
      if (err instanceof ServiceError) {
        return json({ error: err.message }, { status: err.status ?? 400 });
      }
      if (err instanceof SyntaxError && err.message.includes("JSON")) {
        return json({ error: "Malformed JSON in request body" }, { status: 400 });
      }
      // zod .parse() routes: schema rejection is a client error (400), never
      // a 500. Duck-typed on issues[] so this holds for any zod version.
      if (err instanceof Error && err.name === "ZodError" && Array.isArray((err as { issues?: unknown }).issues)) {
        const first = (err as unknown as { issues: { message?: string }[] }).issues[0];
        return json({ error: first?.message ?? "Invalid input" }, { status: 400 });
      }
      if (err instanceof ForbiddenError) {
        return json({ error: err.message }, { status: 403 });
      }
      if (err instanceof UnauthorizedError) {
        return json({ error: err.message }, { status: 401 });
      }

      // Prisma error code mapping — transient DB errors get retryable status
      // codes so the start wrapper / load balancer can retry.
      const prismaCode = (err as { code?: string })?.code;
      if (prismaCode) {
        if (prismaCode === "P2024") {
          // Connection pool exhausted — the DB can't keep up. 503 tells
          // the load balancer to retry and the start wrapper to consider
          // a restart if it persists.
          console.error("[apiHandler] Prisma P2024: connection pool exhausted");
          return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
        }
        if (prismaCode === "P1001") {
          // DB unreachable — the DB is down or network is partitioned.
          console.error("[apiHandler] Prisma P1001: database unreachable");
          return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
        }
        if (prismaCode === "P1002") {
          // DB timeout — query took too long.
          console.error("[apiHandler] Prisma P1002: database timeout");
          return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
        }
        if (prismaCode === "P2002") {
          // Unique constraint — e.g. duplicate SKU/phone/email. 409 + a
          // plain-language message so the user knows to change the value
          // instead of seeing a generic "internal server error".
          const target = (err as { meta?: { target?: string[] | string } })?.meta?.target;
          const field = Array.isArray(target) ? target[0] : typeof target === "string" ? target : null;
          const nice = field ? field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase() : null;
          return json({ error: nice ? `That ${nice} is already in use — pick a different one.` : "A record with those values already exists." }, { status: 409 });
        }
        if (prismaCode === "P2025") {
          // Record not found — usually a stale page editing a deleted row.
          return json({ error: "This record no longer exists — it may have been deleted." }, { status: 404 });
        }
      }

      // Log the full error server-side but don't leak internal details to the client
      console.error("[apiHandler] Unhandled error:", err);

      const status = (err as { status?: number })?.status ?? 500;

      // Capture 500s in Sentry (no-op without SENTRY_DSN) AND in the
      // ErrorLog table — the developer console must see server crashes
      // even when Sentry isn't configured.
      if (status >= 500) {
        try {
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureException(err);
        } catch {
          // Sentry not available — continue without.
        }
        try {
          const u = await getCurrentUser().catch(() => null);
          const result = await recordError({
            type: "server",
            source: "server",
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            url: req.url,
            userAgent: req.headers.get("user-agent"),
            userId: u?.id ?? null,
            companyId: u?.companyId ?? null,
          });
          if (result.created || result.reopened) {
            await notifyDevelopersOfError({
              message: err instanceof Error ? err.message : String(err),
              url: req.url,
              reopened: result.reopened,
            });
          }
        } catch {
          // Error recording must never mask the original failure
        }
      }

      return json({ error: status === 500 ? "Internal server error" : (err instanceof Error ? err.message : "Request failed") }, { status });
    } finally {
      untrack();
    }
    });
  };
}

/**
 * Wrap an API handler that requires a specific permission.
 * Returns 403 if the user's role lacks the permission.
 */
export function apiHandlerWithPermission<TReq extends Request = Request, TCtx = unknown>(
  permission: string,
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
) {
  // Delegate to apiHandler so this wrapper inherits ALL robustness layers:
  // backpressure protection, rate limiting, Prisma error mapping (P2024/P1001/
  // P1002 → 503/504), Sentry capture, Cache-Control headers, and the
  // request-scoped memoization context. The previous standalone try/catch
  // bypassed all of these — a 500 from a Prisma pool exhaustion would leak
  // as a raw 500 instead of a retryable 503, and there was no rate limiting.
  return apiHandler<TReq, TCtx>(async (req, ctx) => {
    await requirePermission(permission);
    return fn(req, ctx);
  });
}

/**
 * Wrap an API handler that requires one of the given roles.
 */
export function apiHandlerWithRole<TReq extends Request = Request, TCtx = unknown>(
  allowed: Role[],
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
) {
  // Delegate to apiHandler — see apiHandlerWithPermission for rationale.
  return apiHandler<TReq, TCtx>(async (req, ctx) => {
    await requireRole(...allowed);
    return fn(req, ctx);
  });
}

/** Roles allowed to view the procurement approvals queue. */
export const APPROVAL_QUEUE_ROLES = APPROVER_ROLES;

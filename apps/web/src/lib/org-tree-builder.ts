import type {
  OrgPersonNode,
  OrgAssignmentGroup,
  OrgTeamNode,
  OrgMemberNode,
  OrgTaskSummary,
  OrgAttendanceInfo,
  OrgLeaveInfo,
} from "@/lib/org-hierarchy-types";
import { migrateRole } from "@/lib/roles";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PREFERRED PARENT ROLE — the natural functional reporting hierarchy.
 *
 * When no explicit reporting line is set (UserCompany.reportsToUserCompanyId
 * or Employee.reportsToEmployeeId), this map determines who each role should
 * report to. It follows the natural construction company org chart:
 *
 *   OWNER → root
 *   ADMIN → OWNER
 *   DEVELOPER → ADMIN
 *   PROJECT_DIRECTOR → OWNER               (direct report to owner)
 *   FINANCE_HEAD → ADMIN
 *   HR_MANAGER → ADMIN
 *   PROCUREMENT_MANAGER → ADMIN
 *   SALES_MANAGER → ADMIN
 *   PROJECT_MANAGER → PROJECT_DIRECTOR
 *   ACCOUNTANT → FINANCE_HEAD
 *   SITE_ENGINEER → PROJECT_MANAGER
 *   STORE_KEEPER → SITE_ENGINEER        (on-site, under the site engineer)
 *   SUPERVISOR → SITE_ENGINEER
 *   QAQC_ENGINEER → PROJECT_MANAGER     (independent — doesn't report to
 *                                        the site engineer whose work they check)
 *
 * If the preferred parent role doesn't exist in the company, we walk up
 * the chain (e.g. no PROJECT_DIRECTOR → PROJECT_MANAGER reports to ADMIN).
 * ═══════════════════════════════════════════════════════════════════════════
 */
const PREFERRED_PARENT_ROLE: Record<string, string | null> = {
  OWNER: null,               // root
  ADMIN: "OWNER",
  DEVELOPER: "ADMIN",
  PROJECT_DIRECTOR: "OWNER",
  FINANCE_HEAD: "ADMIN",
  HR_MANAGER: "ADMIN",
  PROCUREMENT_MANAGER: "ADMIN",      // separate function, not under finance
  SALES_MANAGER: "ADMIN",             // separate function, not under project
  PROJECT_MANAGER: "PROJECT_DIRECTOR",
  ACCOUNTANT: "FINANCE_HEAD",
  SITE_ENGINEER: "PROJECT_MANAGER",
  STORE_KEEPER: "SITE_ENGINEER",     // on-site, under the site engineer
  SUPERVISOR: "SITE_ENGINEER",
  QAQC_ENGINEER: "PROJECT_MANAGER",   // independent from site engineer
};

/**
 * Resolve the preferred parent role for a given role string.
 * Uses migrateRole to handle custom/legacy roles — they map to a base
 * role whose preferred parent is used. Returns null if the role should
 * be a root (OWNER).
 *
 * If customRoles is provided, custom roles (CUSTOM_*) are resolved via
 * their baseRole from the CustomRole table.
 */
function preferredParentRole(role: string, customRoles?: Map<string, CustomRoleDef>): string | null {
  // Standard built-in role
  if (role in PREFERRED_PARENT_ROLE) return PREFERRED_PARENT_ROLE[role]!;
  // Custom role — resolve via baseRole from the CustomRole table
  if (customRoles && role.startsWith("CUSTOM_")) {
    const cr = customRoles.get(role);
    if (cr) {
      const parent = PREFERRED_PARENT_ROLE[cr.baseRole];
      if (parent !== undefined) return parent;
      // baseRole is OWNER → this custom role is a root
      if (cr.baseRole === "OWNER") return null;
    }
  }
  // Try the migrated role (legacy roles)
  const migrated = migrateRole(role);
  if (migrated && migrated in PREFERRED_PARENT_ROLE) {
    return PREFERRED_PARENT_ROLE[migrated]!;
  }
  // Unknown role — fall back to tier-based parent
  return null;
}

/**
 * Fallback tier-based parent role for unknown/custom roles.
 * Returns the role that a person of the given tier should report to.
 */
const TIER_PARENT_ROLE: Record<number, string> = {
  1: "OWNER",
  2: "ADMIN",
  3: "ADMIN",
  4: "ADMIN",
  5: "ADMIN",
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORG TREE BUILDER — shared logic for assembling the people hierarchy.
 *
 * Used by both the mobile (/m/hr) and desktop (/hr) HR home pages.
 *
 * REPORTING TREE:
 *   1. If a person has an explicit `reportsToUserCompanyId` that points to
 *      another membership in the same company, use it (the real reporting line).
 *   2. If no explicit reporting line is set (the common case), INFER the
 *      hierarchy from role tiers, with OWNER as the single root:
 *        OWNER                        → THE root (always)
 *        ADMIN                        → reports to OWNER
 *        Tier 2 (DIRECTOR/CFO)        → reports to ADMIN (or OWNER)
 *        Tier 3 (MANAGERS)            → reports to first Tier 2 (or up)
 *        Tier 4 (EXECUTION)           → reports to first Tier 3 (or up)
 *        Tier 5 (FIELD)               → reports to first Tier 4 (or up)
 *
 *      Within tier 1, OWNER is always above ADMIN — the owner is the
 *      principal, the admin is their delegate. This produces a single
 *      trunk, not two parallel roots.
 *
 * TEAMS / CREWS:
 *   Crews (Crew model) are nested under the User who leads them (linked
 *   via Employee.userId → User.id, and Crew.supervisorId → Employee.id).
 *   Under each crew, its Employee members appear as leaf nodes.
 *   Employees not in any crew are grouped by trade under "Field Labour"
 *   at the company root level.
 *
 * ASSIGNMENT TREE:
 *   Uses explicit UserScope entries (project/department assignments).
 *   If no scopes are set, everyone lands in "Unassigned".
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface RawMembership {
  id: string;
  userId: string;
  role: string;
  reportsToUserCompanyId: string | null;
  hierarchyLevel: number | null; // from Employee.hierarchyLevel (H1-H6)
  /** Employee.id — linked Employee record (if any). Used for:
   *  1. Linking to /m/hr/employees/[id] in the org tree.
   *  2. Employee.reportsToEmployeeId as a fallback reporting line. */
  employeeId: string | null;
  /** Employee.reportsToEmployeeId — on-site reporting line (Employee→Employee).
   *  Independent of UserCompany.reportsToUserCompanyId (permission chain). */
  reportsToEmployeeId: string | null;
  scopes: {
    scopeKind: string;
    projectId: string | null;
    departmentId: string | null;
    department: { name: string } | null;
    project: { name: string } | null;
  }[];
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    active: boolean;
    designation: string | null;
    department: string | null;
    employeeCode: string | null;
  };
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignedToId: string;
}

interface DprRow {
  id: string;
  date: Date;
  approvalStatus: string;
  submittedById: string | null;
  project: { name: string } | null;
}

interface RawCrew {
  id: string;
  name: string;
  supervisorId: string | null;
  // supervisor's Employee → userId (to link crew → User)
  supervisor: { userId: string | null } | null;
  project: { name: string } | null;
  members: RawEmployee[];
}

interface RawEmployee {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  wageType: string | null;
  dailyRate: { toString: () => string } | null;
  monthlySalary: { toString: () => string } | null;
  active: boolean;
  crewId: string | null;
  phone: string | null;
  activeProject: { name: string } | null;
}

/** All tasks for a user (not just open) — for task summary breakdown. */
interface AllTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignedToId: string;
}

/** Today's attendance for an employee (linked to user via Employee.userId). */
interface AttendanceRow {
  employeeId: string;
  userId: string | null;
  status: string;
  checkIn: Date | null;
  checkOut: Date | null;
  project: { name: string } | null;
}

/** Leave request rows for leave info. */
interface LeaveRow {
  id: string;
  employeeId: string;
  userId: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
}

/** Custom role definition — lets the tree builder resolve custom roles
 *  (CUSTOM_*) to their base role for parent mapping + display their
 *  real label instead of the fallback "Supervisor". */
export interface CustomRoleDef {
  key: string;       // e.g. "CUSTOM_SUB_ADMIN"
  label: string;     // e.g. "Sub Admin"
  baseRole: string;  // e.g. "ADMIN"
  tier: number;      // 1-5
  hierarchyLevel?: number | null; // optional H-level (1-6) for org tree depth
}

export interface OrgTreeResult {
  roots: OrgPersonNode[];
  unassigned: OrgPersonNode[];
  projects: OrgAssignmentGroup[];
  departments: OrgAssignmentGroup[];
  labourByTrade: { trade: string; members: OrgMemberNode[] }[];
  labourCount: number;
}

/**
 * Sub-tier within tier 1. OWNER is the principal (sub-tier 0), ADMIN is
 * their delegate (sub-tier 1). This ensures OWNER is always the single
 * root and ADMIN reports to them, not alongside them.
 */
function subTier(role: string): number {
  if (role === "OWNER") return 0;
  if (role === "ADMIN") return 1;
  return 2; // everyone else
}

/**
 * Compute task summary counts from a list of tasks.
 * Counts: pending, inProgress, completed, overdue (pending/in-progress with past dueDate),
 * dueToday (pending/in-progress with dueDate today).
 */
export function computeTaskSummary(
  tasks: { status: string; dueDate: Date | null }[],
  now: Date = new Date(),
): { pending: number; inProgress: number; completed: number; overdue: number; dueToday: number } {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  let pending = 0, inProgress = 0, completed = 0, overdue = 0, dueToday = 0;
  for (const t of tasks) {
    if (t.status === "PENDING") pending++;
    else if (t.status === "IN_PROGRESS") inProgress++;
    else if (t.status === "COMPLETED") completed++;

    const isActive = t.status === "PENDING" || t.status === "IN_PROGRESS";
    if (isActive && t.dueDate) {
      // Overdue: dueDate is in the past (before now)
      if (t.dueDate < now) overdue++;
      // Due today: dueDate falls within today's date range
      if (t.dueDate >= todayStart && t.dueDate <= todayEnd) dueToday++;
    }
  }
  return { pending, inProgress, completed, overdue, dueToday };
}

/**
 * Build the full org tree (reporting + assignment + teams) from raw DB rows.
 */
export function buildOrgTree(
  memberships: RawMembership[],
  tasks: TaskRow[],
  dprs: DprRow[],
  crews: RawCrew[],
  unassignedEmployees: RawEmployee[],
  currentUserId: string | null,
  roleTier: (role: string) => number,
  roleLabel: (role: string) => string,
  // ── Enrichment data (optional — defaults to empty) ──
  allTasks: AllTaskRow[] = [],
  attendance: AttendanceRow[] = [],
  leaveRequests: LeaveRow[] = [],
  // ── Custom role definitions (optional) — lets the tree builder ──
  //    resolve custom roles (CUSTOM_*) to their base role for parent ──
  //    mapping and display their real label instead of "Supervisor". ──
  customRoles: CustomRoleDef[] = [],
): OrgTreeResult {
  // ── Build custom roles lookup map ──
  const customRoleMap = new Map<string, CustomRoleDef>();
  for (const cr of customRoles) {
    customRoleMap.set(cr.key, cr);
  }

  // ── Index tasks + DPRs by user ──
  const tasksByUser = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const arr = tasksByUser.get(t.assignedToId) ?? [];
    arr.push(t);
    tasksByUser.set(t.assignedToId, arr);
  }
  const dprsByUser = new Map<string, DprRow[]>();
  for (const d of dprs) {
    if (!d.submittedById) continue;
    const arr = dprsByUser.get(d.submittedById) ?? [];
    if (arr.length < 5) arr.push(d);
    dprsByUser.set(d.submittedById, arr);
  }

  // ── Index ALL tasks by user for task summary ──
  const allTasksByUser = new Map<string, AllTaskRow[]>();
  for (const t of allTasks) {
    const arr = allTasksByUser.get(t.assignedToId) ?? [];
    arr.push(t);
    allTasksByUser.set(t.assignedToId, arr);
  }

  // ── Index attendance + leave by userId ──
  const attendanceByUser = new Map<string, AttendanceRow>();
  for (const a of attendance) {
    if (a.userId) attendanceByUser.set(a.userId, a);
  }
  const leaveCountByUser = new Map<string, number>();
  const leaveTodayByUser = new Set<string>();
  const todayMs = Date.now();
  for (const l of leaveRequests) {
    if (l.userId) {
      if (l.status === "PENDING") {
        leaveCountByUser.set(l.userId, (leaveCountByUser.get(l.userId) ?? 0) + 1);
      }
      if (l.status === "APPROVED") {
        const startMs = l.startDate.getTime();
        const endMs = l.endDate.getTime();
        if (todayMs >= startMs && todayMs <= endMs) {
          leaveTodayByUser.add(l.userId);
        }
      }
    }
  }

  // ── Build crew nodes, indexed by supervisor's userId ──
  const teamsByUserId = new Map<string, OrgTeamNode[]>();
  for (const c of crews) {
    const team: OrgTeamNode = {
      id: c.id,
      name: c.name,
      trade: c.members[0]?.trade ?? null, // primary trade
      projectName: c.project?.name ?? null,
      members: c.members.map((e) => ({
        id: e.id,
        name: e.name,
        trade: e.trade,
        designation: e.designation,
        wageType: e.wageType,
        dailyRate: e.dailyRate?.toString() ?? null,
        monthlySalary: e.monthlySalary?.toString() ?? null,
        active: e.active,
        activeProjectName: e.activeProject?.name ?? null,
        phone: e.phone,
      })),
    };
    const supUserId = c.supervisor?.userId;
    if (supUserId) {
      const arr = teamsByUserId.get(supUserId) ?? [];
      arr.push(team);
      teamsByUserId.set(supUserId, arr);
    }
  }

  // ── Build person nodes ──
  const nodeMap = new Map<string, OrgPersonNode>();
  for (const m of memberships) {
    const tier = roleTier(m.role);
    const userTasks = tasksByUser.get(m.userId) ?? [];
    const userDprs = dprsByUser.get(m.userId) ?? [];
    const userTeams = teamsByUserId.get(m.userId) ?? [];
    const userAllTasks = allTasksByUser.get(m.userId) ?? [];

    // ── Task summary: count by status ──
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const taskSummary: OrgTaskSummary = {
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      dueToday: 0,
    };
    for (const t of userAllTasks) {
      if (t.status === "PENDING") taskSummary.pending++;
      else if (t.status === "IN_PROGRESS") taskSummary.inProgress++;
      else if (t.status === "COMPLETED") taskSummary.completed++;
      if (
        (t.status === "PENDING" || t.status === "IN_PROGRESS") &&
        t.dueDate
      ) {
        const dueMs = t.dueDate.getTime();
        if (dueMs < todayMs) taskSummary.overdue++;
        if (dueMs <= todayEnd.getTime() && dueMs >= Date.UTC(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate())) {
          taskSummary.dueToday++;
        }
      }
    }

    // ── Attendance + leave info ──
    const att = attendanceByUser.get(m.userId);
    const attendance: OrgAttendanceInfo | null = att
      ? {
          status: att.status,
          projectName: att.project?.name ?? null,
          checkIn: att.checkIn?.toISOString() ?? null,
          checkOut: att.checkOut?.toISOString() ?? null,
        }
      : null;

    const leave: OrgLeaveInfo | null = {
      pendingRequests: leaveCountByUser.get(m.userId) ?? 0,
      onLeaveToday: leaveTodayByUser.has(m.userId),
    };

    nodeMap.set(m.id, {
      id: m.id,
      userId: m.userId,
      employeeId: m.employeeId ?? null,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      role: m.role,
      roleLabel: roleLabel(m.role),
      tier,
      hierarchyLevel: m.hierarchyLevel ?? null,
      designation: m.user.designation,
      employeeCode: m.user.employeeCode,
      active: m.user.active,
      isSelf: m.userId === currentUserId,
      scopes: m.scopes.map((s) => ({
        kind: s.scopeKind,
        projectName: s.project?.name ?? null,
        departmentName: s.department?.name ?? null,
      })),
      openTaskCount: userTasks.length,
      openTasks: userTasks.slice(0, 6).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
      })),
      taskSummary,
      attendance,
      leave,
      recentDprs: userDprs.slice(0, 3).map((d) => ({
        id: d.id,
        projectName: d.project?.name ?? "—",
        date: d.date.toISOString(),
        approvalStatus: d.approvalStatus,
      })),
      reports: [],
      teams: userTeams,
      descendantCount: 0,
      hasChildren: userTeams.length > 0, // will be updated after reports are assembled
    });
  }

  // ── Check if anyone has explicit reporting lines ──
  // Priority: UserCompany.reportsToUserCompanyId (permission chain) first,
  // then Employee.reportsToEmployeeId (on-site reporting line) as fallback.
  const employeeIdToNodeMap = new Map<string, OrgPersonNode>();
  for (const n of nodeMap.values()) {
    if (n.employeeId) employeeIdToNodeMap.set(n.employeeId, n);
  }

  // ── Assemble reporting tree ──
  // Strategy: explicit reporting lines first, then functional inference
  // for anyone not yet attached. This handles mixed scenarios where some
  // people have explicit reportsTo set and others don't.
  const roots: OrgPersonNode[] = [];

  // Track which nodes have been placed in the tree
  const placed = new Set<string>();

  // ── Step 1: Process explicit reporting relationships ──
  // Skip self-references and detect cycles (A→B, B→A).
  // `parentOf` maps childId → parentId so we can walk up the chain
  // to detect if adding `node` under `parent` would create a cycle.
  const parentOf = new Map<string, string>();
  for (const m of memberships) {
    const node = nodeMap.get(m.id)!;
    // 1. Try UserCompany.reportsToUserCompanyId (permission chain)
    const reportsTo = m.reportsToUserCompanyId;
    if (reportsTo && reportsTo !== m.id && nodeMap.has(reportsTo)) {
      const parent = nodeMap.get(reportsTo)!;
      // Cycle guard: walk up from `parent` — if we reach `node`, skip
      let cur: string | undefined = parent.id;
      let isCycle = false;
      while (cur) {
        if (cur === node.id) { isCycle = true; break; }
        cur = parentOf.get(cur);
      }
      if (!isCycle) {
        parent.reports.push(node);
        placed.add(m.id);
        parentOf.set(node.id, parent.id);
      }
      continue;
    }
    // 2. Try Employee.reportsToEmployeeId (on-site reporting line)
    const empReportsTo = m.reportsToEmployeeId;
    if (empReportsTo && empReportsTo !== m.id && employeeIdToNodeMap.has(empReportsTo)) {
      const parent = employeeIdToNodeMap.get(empReportsTo)!;
      // Cycle guard (same walk-up check using nodeMap ids)
      let cur: string | undefined = parent.id;
      let isCycle = false;
      while (cur) {
        if (cur === node.id) { isCycle = true; break; }
        cur = parentOf.get(cur);
      }
      if (!isCycle) {
        parent.reports.push(node);
        placed.add(m.id);
        parentOf.set(node.id, parent.id);
      }
      continue;
    }
  }

  // ── Step 2: Infer parents for unattached people ──
  // Use functional parent-role mapping: each role has a natural parent
  // role (SITE_ENGINEER → PROJECT_MANAGER, FINANCE_HEAD → ADMIN, etc.).
  // If the parent role doesn't exist, walk up the chain.
  // Among multiple candidates, use scope matching.

  // Index all people by role for fast lookup
  const peopleByRole = new Map<string, OrgPersonNode[]>();
  for (const n of nodeMap.values()) {
    const arr = peopleByRole.get(n.role) ?? [];
    arr.push(n);
    peopleByRole.set(n.role, arr);
  }

  // Scope helpers
  const scopeProjectNames = (n: OrgPersonNode): Set<string> =>
    new Set(n.scopes.filter((s) => s.kind === "PROJECT").map((s) => s.projectName).filter(Boolean) as string[]);
  const scopeDeptNames = (n: OrgPersonNode): Set<string> =>
    new Set(n.scopes.filter((s) => s.kind === "DEPARTMENT").map((s) => s.departmentName).filter(Boolean) as string[]);

  function pickParentByScope(
    child: OrgPersonNode,
    candidates: OrgPersonNode[],
    roundRobinIdx: number,
  ): OrgPersonNode {
    const childProjects = scopeProjectNames(child);
    const childDepts = scopeDeptNames(child);
    if (childProjects.size > 0 || childDepts.size > 0) {
      for (const p of candidates) {
        const pProjects = scopeProjectNames(p);
        const pDepts = scopeDeptNames(p);
        const overlap =
          [...childProjects].some((x) => pProjects.has(x)) ||
          [...childDepts].some((x) => pDepts.has(x));
        if (overlap) return p;
      }
    }
    return candidates[roundRobinIdx % candidates.length]!;
  }

  /** Check if a node is already placed (in roots or as someone's report).
   *  O(1) via the `placed` Set — no scanning required. */
  function isPlaced(n: OrgPersonNode): boolean {
    return placed.has(n.id) || roots.includes(n);
  }

  /** Find parent candidates for a person by walking up the
   *  preferred-parent-role chain. Returns null if no parent found. */
  function findParentCandidates(
    person: OrgPersonNode,
  ): OrgPersonNode[] | null {
    let currentRole = person.role;
    const visited = new Set<string>([currentRole]);

    for (let depth = 0; depth < 10; depth++) {
      // Look up preferred parent role
      let parentRole = preferredParentRole(currentRole, customRoleMap);
      if (parentRole === null) {
        // currentRole is OWNER or unknown — no parent
        if (currentRole === "OWNER") return null;
        // Unknown role — use tier-based fallback
        parentRole = TIER_PARENT_ROLE[person.tier] ?? "ADMIN";
      }

      // Check if any placed people with this role exist
      const candidates = (peopleByRole.get(parentRole) ?? []).filter((n) => isPlaced(n));
      // Also check custom roles whose baseRole matches parentRole
      if (candidates.length === 0) {
        for (const [role, people] of peopleByRole) {
          if (role.startsWith("CUSTOM_")) {
            const cr = customRoleMap.get(role);
            if (cr && cr.baseRole === parentRole) {
              candidates.push(...people.filter((n) => isPlaced(n)));
            }
          } else {
            const migrated = migrateRole(role);
            if (migrated === parentRole) {
              candidates.push(...people.filter((n) => isPlaced(n)));
            }
          }
        }
      }

      if (candidates.length > 0) {
        return candidates;
      }

      // Walk up: find the preferred parent of the parent role
      if (visited.has(parentRole)) break; // cycle guard
      visited.add(parentRole);
      currentRole = parentRole;
    }
    return null;
  }

  // Process unattached people in tier order (top to bottom) so parents
  // are placed before children. OWNERs are pre-placed as roots first so
  // that other tier-1 roles (ADMIN, DEVELOPER) can find them as parents.
  const unattached = Array.from(nodeMap.values())
    .filter((n) => !isPlaced(n))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  // Pre-place OWNERs (and custom OWNER-based roles) as roots
  for (const person of unattached) {
    if (person.role === "OWNER") {
      roots.push(person);
      placed.add(person.id);
      continue;
    }
    if (person.role.startsWith("CUSTOM_")) {
      const cr = customRoleMap.get(person.role);
      if (cr && cr.baseRole === "OWNER") {
        roots.push(person);
        placed.add(person.id);
        continue;
      }
    }
  }

  const roundRobinCounters = new Map<string, number>();

  for (const person of unattached) {
    // Skip already-placed OWNERs
    if (isPlaced(person)) continue;

    const candidates = findParentCandidates(person);
    if (candidates === null || candidates.length === 0) {
      // No parent found — report to first OWNER, or become a root
      const owners = roots.filter((r) => r.role === "OWNER");
      if (owners.length > 0) {
        owners[0]!.reports.push(person);
        parentOf.set(person.id, owners[0]!.id);
      } else {
        roots.push(person);
      }
      placed.add(person.id);
      continue;
    }

    let parent: OrgPersonNode;
    if (candidates.length === 1) {
      parent = candidates[0]!;
    } else {
      // Multiple candidates — use scope matching, then round-robin
      const parentRole = candidates[0]!.role;
      const idx = roundRobinCounters.get(parentRole) ?? 0;
      roundRobinCounters.set(parentRole, idx + 1);
      parent = pickParentByScope(person, candidates, idx);
    }
    // Cycle guard: don't attach if `parent` is a descendant of `person`
    let cur: string | undefined = parent.id;
    let isCycle = false;
    while (cur) {
      if (cur === person.id) { isCycle = true; break; }
      cur = parentOf.get(cur);
    }
    if (isCycle) {
      // Would create a cycle — fall back to OWNER or root
      const owners = roots.filter((r) => r.role === "OWNER");
      if (owners.length > 0) {
        owners[0]!.reports.push(person);
        parentOf.set(person.id, owners[0]!.id);
      } else {
        roots.push(person);
      }
    } else {
      parent.reports.push(person);
      parentOf.set(person.id, parent.id);
    }
    placed.add(person.id);
  }
  // ── Compute descendant counts (recursive) ──
  function countDescendants(node: OrgPersonNode): number {
    let count = node.reports.length + node.teams.reduce((s, t) => s + t.members.length, 0);
    for (const r of node.reports) count += countDescendants(r);
    return count;
  }
  for (const node of nodeMap.values()) {
    node.descendantCount = countDescendants(node);
    node.hasChildren = node.reports.length > 0 || node.teams.length > 0;
  }

  // Sort reports by effective level then name (recursive).
  function sortReports(node: OrgPersonNode) {
    const eff = (n: OrgPersonNode) => n.hierarchyLevel ?? n.tier;
    node.reports.sort((a, b) => eff(a) - eff(b) || a.name.localeCompare(b.name));
    for (const r of node.reports) sortReports(r);
  }
  roots.sort((a, b) => subTier(a.role) - subTier(b.role) || a.name.localeCompare(b.name));
  for (const r of roots) sortReports(r);

  // ── Prune tree to the current user's subtree ──
  // Show only the current user and people BELOW them in the hierarchy.
  // OWNER/ADMIN see the full tree (they're at the top). Managers/supervisors
  // see only their own subtree — not the chain above them.
  if (currentUserId) {
    const currentUserNodes = Array.from(nodeMap.values()).filter((n) => n.userId === currentUserId);
    if (currentUserNodes.length > 0) {
      const currentNode = currentUserNodes[0]!;
      // Only prune if the current user is NOT a root (i.e., they have someone
      // above them in the hierarchy). OWNER and ADMIN are typically roots.
      const isRoot = roots.includes(currentNode);
      if (!isRoot) {
        // Replace roots with just the current user's subtree
        roots.length = 0;
        roots.push(currentNode);
      }
    }
  }

  // ── Assemble assignment tree ──
  const projectMap = new Map<string, OrgAssignmentGroup>();
  const deptMap = new Map<string, OrgAssignmentGroup>();
  const unassigned: OrgPersonNode[] = [];

  for (const m of memberships) {
    const node = nodeMap.get(m.id)!;
    if (m.scopes.length === 0) {
      unassigned.push(node);
      continue;
    }
    for (const s of m.scopes) {
      if (s.projectId) {
        if (!projectMap.has(s.projectId)) {
          projectMap.set(s.projectId, {
            id: s.projectId,
            name: s.project?.name ?? "Project",
            kind: "PROJECT",
            people: [],
          });
        }
        projectMap.get(s.projectId)!.people.push(node);
      } else if (s.departmentId) {
        if (!deptMap.has(s.departmentId)) {
          deptMap.set(s.departmentId, {
            id: s.departmentId,
            name: s.department?.name ?? "Department",
            kind: "DEPARTMENT",
            people: [],
          });
        }
        deptMap.get(s.departmentId)!.people.push(node);
      } else {
        unassigned.push(node);
      }
    }
  }

  // ── Group unassigned employees by trade ──
  const byTrade = new Map<string, OrgMemberNode[]>();
  for (const e of unassignedEmployees) {
    const trade = e.trade ?? "General";
    const arr = byTrade.get(trade) ?? [];
    arr.push({
      id: e.id,
      name: e.name,
      trade: e.trade,
      designation: e.designation,
      wageType: e.wageType,
      dailyRate: e.dailyRate?.toString() ?? null,
      monthlySalary: e.monthlySalary?.toString() ?? null,
      active: e.active,
      activeProjectName: e.activeProject?.name ?? null,
      phone: e.phone,
    });
    byTrade.set(trade, arr);
  }
  const labourByTrade = Array.from(byTrade.entries())
    .map(([trade, members]) => ({ trade, members }))
    .sort((a, b) => a.trade.localeCompare(b.trade));

  return {
    roots,
    unassigned,
    projects: Array.from(projectMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    departments: Array.from(deptMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    labourByTrade,
    labourCount: unassignedEmployees.length,
  };
}

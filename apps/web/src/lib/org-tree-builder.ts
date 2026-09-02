import type {
  OrgPersonNode,
  OrgAssignmentGroup,
  OrgTeamNode,
  OrgMemberNode,
  OrgTaskSummary,
  OrgAttendanceInfo,
  OrgLeaveInfo,
} from "@/app/m/hr/OrgHierarchy";

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
): OrgTreeResult {
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
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      role: m.role,
      roleLabel: roleLabel(m.role),
      tier,
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
  const hasExplicitReports = memberships.some(
    (m) => m.reportsToUserCompanyId && nodeMap.has(m.reportsToUserCompanyId),
  );

  // ── Assemble reporting tree ──
  const roots: OrgPersonNode[] = [];

  if (hasExplicitReports) {
    for (const m of memberships) {
      const node = nodeMap.get(m.id)!;
      const reportsTo = m.reportsToUserCompanyId;
      if (reportsTo && nodeMap.has(reportsTo)) {
        nodeMap.get(reportsTo)!.reports.push(node);
      } else {
        roots.push(node);
      }
    }
  } else {
    // ── Infer hierarchy from role tiers ──
    // OWNER is always the single root. ADMIN reports to OWNER.
    // Lower tiers report to the nearest tier above them.

    const owners = Array.from(nodeMap.values())
      .filter((n) => n.role === "OWNER")
      .sort((a, b) => a.name.localeCompare(b.name));
    const admins = Array.from(nodeMap.values())
      .filter((n) => n.role === "ADMIN")
      .sort((a, b) => a.name.localeCompare(b.name));
    const others = Array.from(nodeMap.values())
      .filter((n) => n.role !== "OWNER" && n.role !== "ADMIN")
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

    // OWNER(s) are roots. If multiple owners, they're co-roots (partners).
    for (const o of owners) roots.push(o);

    // If no OWNER exists, ADMIN becomes root.
    if (owners.length === 0) {
      for (const a of admins) roots.push(a);
    } else {
      // ADMIN reports to the first OWNER (or distributed if multiple).
      if (owners.length === 1) {
        for (const a of admins) owners[0]!.reports.push(a);
      } else {
        for (let i = 0; i < admins.length; i++) {
          owners[i % owners.length]!.reports.push(admins[i]!);
        }
      }
    }

    // Group all non-OWNER/ADMIN by tier for hierarchical assignment.
    const byTier = new Map<number, OrgPersonNode[]>();
    for (const n of others) {
      const arr = byTier.get(n.tier) ?? [];
      arr.push(n);
      byTier.set(n.tier, arr);
    }
    const tiersPresent = Array.from(byTier.keys()).sort((a, b) => a - b);

    // For each tier (ascending), assign each person to someone at the
    // nearest tier above them. "Above" includes OWNER/ADMIN as tier 1.
    for (const t of tiersPresent) {
      const nodesAtTier = byTier.get(t) ?? [];
      if (nodesAtTier.length === 0) continue;

      // Find the nearest lower tier that has people (including owners/admins).
      let parents: OrgPersonNode[] = [];
      // Check tier 1 (owners + admins already placed).
      if (t > 1) {
        const tier1 = [...roots, ...roots.flatMap((r) => r.reports)];
        if (tier1.length > 0) {
          parents = tier1;
        }
        // Also check tiers between 1 and t.
        for (let pt = t - 1; pt >= 2; pt--) {
          const candidates = byTier.get(pt) ?? [];
          if (candidates.length > 0) {
            // Only use candidates that already have a parent (were placed).
            const placed = candidates.filter((c) =>
              // Check if this node is already in someone's reports
              Array.from(nodeMap.values()).some((n) =>
                n.reports.includes(c),
              ),
            );
            if (placed.length > 0) {
              parents = placed;
              break;
            }
          }
        }
      }

      if (parents.length === 0) {
        // No parent found — become roots.
        for (const n of nodesAtTier) roots.push(n);
      } else if (parents.length === 1) {
        for (const n of nodesAtTier) parents[0]!.reports.push(n);
      } else {
        // Distribute round-robin.
        nodesAtTier.sort((a, b) => a.name.localeCompare(b.name));
        for (let i = 0; i < nodesAtTier.length; i++) {
          parents[i % parents.length]!.reports.push(nodesAtTier[i]!);
        }
      }
    }
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

  // Sort reports by tier then name (recursive).
  function sortReports(node: OrgPersonNode) {
    node.reports.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    for (const r of node.reports) sortReports(r);
  }
  roots.sort((a, b) => subTier(a.role) - subTier(b.role) || a.name.localeCompare(b.name));
  for (const r of roots) sortReports(r);

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

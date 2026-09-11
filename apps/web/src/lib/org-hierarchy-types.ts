/**
 * Shared type definitions for the Organization Hierarchy tree.
 *
 * Used by both the mobile component (`app/m/hr/OrgHierarchy.tsx`) and the
 * desktop component (`components/hr/org-hierarchy.tsx`), as well as the
 * server-side tree builder (`lib/org-tree-builder.ts`).
 *
 * Lives in `lib/` so neither desktop nor mobile depends on the other's
 * route directory for shared types.
 */

export interface OrgScope {
  kind: string;
  projectName: string | null;
  departmentName: string | null;
}

export interface OrgTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface OrgDpr {
  id: string;
  projectName: string;
  date: string;
  approvalStatus: string;
}

/** Task summary broken down by status — for the person detail card. */
export interface OrgTaskSummary {
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueToday: number;
}

/** Today's attendance snapshot for a person (field worker). */
export interface OrgAttendanceInfo {
  status: string | null; // PRESENT | ABSENT | HALF_DAY | LATE | LEAVE | null
  projectName: string | null; // project they checked into
  checkIn: string | null; // ISO timestamp
  checkOut: string | null;
}

/** Leave balance snapshot. */
export interface OrgLeaveInfo {
  pendingRequests: number;
  onLeaveToday: boolean;
}

export interface OrgPersonNode {
  id: string; // UserCompany id
  userId: string;
  /** Employee.id — for linking to /m/hr/employees/[id]. Null if this
   *  membership has no linked Employee record (rare — user without
   *  an employee profile). */
  employeeId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  roleLabel: string;
  tier: number;
  /** Custom hierarchy level (H1-H6) from Employee.hierarchyLevel.
   *  Null = unassigned. When present, this drives tree depth + badge. */
  hierarchyLevel: number | null;
  designation: string | null;
  employeeCode: string | null;
  active: boolean;
  isSelf: boolean;
  scopes: OrgScope[];
  openTaskCount: number;
  openTasks: OrgTask[];
  recentDprs: OrgDpr[];
  /** Task counts by status — powers the task summary in the detail card. */
  taskSummary: OrgTaskSummary;
  /** Today's attendance (null if not a field worker or not logged). */
  attendance: OrgAttendanceInfo | null;
  /** Leave info — pending requests + whether on leave today. */
  leave: OrgLeaveInfo | null;
  reports: OrgPersonNode[];
  /** Teams (crews) led by this person, if any. */
  teams: OrgTeamNode[];
  /** Total descendant count (direct + indirect reports + team members). */
  descendantCount: number;
  /** Whether this node has direct children (reports or teams). Computed
   *  server-side as a primitive boolean — survives RSC serialization even
   *  when the recursive `reports` array is lost (Turbopack bug). */
  hasChildren: boolean;
}

/** A crew/team — a group of field workers under a supervisor. */
export interface OrgTeamNode {
  id: string;
  name: string;
  trade: string | null;
  projectName: string | null;
  members: OrgMemberNode[];
}

/** A field worker (Employee model, not a User). */
export interface OrgMemberNode {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  wageType: string | null;
  dailyRate: string | null;
  monthlySalary: string | null;
  active: boolean;
  activeProjectName: string | null;
  phone: string | null;
}

export interface OrgAssignmentGroup {
  id: string;
  name: string;
  kind: "PROJECT" | "DEPARTMENT";
  people: OrgPersonNode[];
}

export interface OrgTreeData {
  companyName: string;
  peopleCount: number;
  projectCount: number;
  /** Roots of the reporting tree (memberships with no reportsTo in-company). */
  roots: OrgPersonNode[];
  /** People not scoped to any project or department (for the assignment view). */
  unassigned: OrgPersonNode[];
  /** People grouped by project (assignment view). */
  projects: OrgAssignmentGroup[];
  /** People grouped by department (assignment view). */
  departments: OrgAssignmentGroup[];
  /** Field workers not in any crew (grouped by trade). */
  labourByTrade: { trade: string; members: OrgMemberNode[] }[];
  /** Total count of field workers (employees). */
  labourCount: number;
}

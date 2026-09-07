"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Building2,
  HardHat,
  Layers,
  CircleUser,
  Mail,
  Phone,
  ClipboardList,
  FileText,
  Inbox,
  Folder,
  FolderOpen,
  Users,
  Wrench,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  MapPin,
  CalendarX,
  UserCheck,
} from "lucide-react";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

/* ═══════════════════════════════════════════════════════════════════════════
   ORGANIZATION HIERARCHY — file-system tree (mirrors InventoryHierarchy)

   Two views, toggled at the top:
     1. Reporting line  — manager → direct reports (org chart)
     2. By assignment    — Company → Project / Department → people

   Each person row shows: name, role badge, designation, open-task count.
   Expanding a person reveals: scope chips, open tasks, recent DPRs, contact.
   ═══════════════════════════════════════════════════════════════════════════ */

const INDENT_PX = 20;

// ── Tier → colour (for the role badge + icon background) ──
const TIER_STYLE: Record<number, { bg: string; fg: string }> = {
  1: { bg: "var(--color-ink-950)", fg: "var(--color-paper)" },
  2: { bg: "var(--color-steel)", fg: "#fff" },
  3: { bg: "var(--color-signal)", fg: "var(--color-ink-950)" },
  4: { bg: "var(--color-concrete)", fg: "var(--color-ink-700)" },
  5: { bg: "var(--color-paper-2)", fg: "var(--color-ink-500)" },
};
function tierStyle(tier: number) {
  return TIER_STYLE[tier] ?? TIER_STYLE[5]!;
}

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
  name: string;
  email: string;
  phone: string | null;
  role: string;
  roleLabel: string;
  tier: number;
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

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export function OrgHierarchy({ tree }: { tree: OrgTreeData }) {
  const [view, setView] = React.useState<"reporting" | "assignment">("reporting");

  return (
    <section className="mb-4">
      {/* ── Toggle ── */}
      <div
        className="flex rounded-[0.5rem] border p-0.5 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <ToggleButton active={view === "reporting"} onClick={() => setView("reporting")}>
          Reporting line
        </ToggleButton>
        <ToggleButton active={view === "assignment"} onClick={() => setView("assignment")}>
          By assignment
        </ToggleButton>
      </div>

      {/* ── Tree container ── */}
      <div
        className="rounded-[0.625rem] border px-1 py-1.5"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {tree.peopleCount === 0 && tree.labourCount === 0 ? (
          <MobileEmptyState
            icon={Users}
            title="No team members yet"
            size="compact"
          />
        ) : view === "reporting" ? (
          <ReportingTree
            roots={tree.roots}
            labourByTrade={tree.labourByTrade}
            labourCount={tree.labourCount}
          />
        ) : (
          <AssignmentTree
            companyName={tree.companyName}
            projects={tree.projects}
            departments={tree.departments}
            unassigned={tree.unassigned}
          />
        )}
      </div>
    </section>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-[0.375rem] py-1.5 text-m-label font-semibold transition-colors press"
      style={
        active
          ? { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
          : { color: "var(--color-ink-500)" }
      }
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   REPORTING TREE — OWNER → ADMIN → managers → supervisors → teams
   ═══════════════════════════════════════════════════════════════════════════ */
function ReportingTree({
  roots,
  labourByTrade,
  labourCount,
}: {
  roots: OrgPersonNode[];
  labourByTrade: { trade: string; members: OrgMemberNode[] }[];
  labourCount: number;
}) {
  if (roots.length === 0 && labourCount === 0) {
    return (
      <MobileEmptyState
        icon={Users}
        title="No reporting lines set up"
        size="compact"
      />
    );
  }
  const hasLabour = labourByTrade.length > 0;
  return (
    <div className="flex flex-col">
      {roots.map((person, i) => (
        <PersonNode
          key={person.id}
          person={person}
          isLast={i === roots.length - 1 && !hasLabour}
          depth={0}
          ancestorLast={[]}
          defaultOpen={roots.length <= 1}
        />
      ))}
      {/* Field labour grouped by trade (no formal crew) */}
      {hasLabour ? (
        <GroupNode
          name="Field Labour"
          icon={<Wrench className="size-2.5" style={{ color: "var(--color-ink-700)" }} />}
          iconBg="var(--color-concrete)"
          sub={`${labourCount} ${labourCount === 1 ? "worker" : "workers"} · ${labourByTrade.length} trades`}
          count={labourCount}
          defaultOpen={false}
          depth={0}
          isLast
          ancestorLast={[]}
        >
          {labourByTrade.map((group, i) => (
            <GroupNode
              key={group.trade}
              name={group.trade}
              icon={<HardHat className="size-2.5" style={{ color: "var(--color-ink-700)" }} />}
              iconBg="var(--color-paper-2)"
              sub={`${group.members.length} ${group.members.length === 1 ? "worker" : "workers"}`}
              count={group.members.length}
              depth={1}
              isLast={i === labourByTrade.length - 1}
              ancestorLast={[true]}
            >
              {group.members.map((member, j) => (
                <MemberNode
                  key={member.id}
                  member={member}
                  isLast={j === group.members.length - 1}
                  depth={2}
                  ancestorLast={[true, i === labourByTrade.length - 1]}
                />
              ))}
            </GroupNode>
          ))}
        </GroupNode>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSIGNMENT TREE — Company → Project / Department → people
   ═══════════════════════════════════════════════════════════════════════════ */
function AssignmentTree({
  companyName,
  projects,
  departments,
  unassigned,
}: {
  companyName: string;
  projects: OrgAssignmentGroup[];
  departments: OrgAssignmentGroup[];
  unassigned: OrgPersonNode[];
}) {
  const groups = [
    ...projects.map((p) => ({ ...p, icon: <HardHat className="size-2.5" style={{ color: "var(--color-ink-700)" }} />, iconBg: "var(--color-concrete)" })),
    ...departments.map((d) => ({ ...d, icon: <Layers className="size-2.5" style={{ color: "var(--color-steel)" }} />, iconBg: "var(--color-steel-wash)" })),
  ];
  const hasUnassigned = unassigned.length > 0;

  return (
    <div className="flex flex-col">
      {/* Company root */}
      <GroupNode
        name={companyName}
        icon={<Building2 className="size-2.5" style={{ color: "var(--color-paper)" }} />}
        iconBg="var(--color-ink-950)"
        sub={`${projects.length + departments.length} groups · ${unassigned.length} unassigned`}
        count={projects.reduce((s, p) => s + p.people.length, 0) + departments.reduce((s, d) => s + d.people.length, 0) + unassigned.length}
        defaultOpen
        depth={0}
        isLast={false}
        ancestorLast={[]}
      >
        {/* Project / Department groups */}
        {groups.map((g, i) => (
          <GroupNode
            key={g.id}
            name={g.name}
            icon={g.icon}
            iconBg={g.iconBg}
            sub={`${g.people.length} ${g.people.length === 1 ? "person" : "people"}`}
            count={g.people.length}
            depth={1}
            isLast={i === groups.length - 1 && !hasUnassigned}
            ancestorLast={[false]}
          >
            {g.people.map((person, j) => (
              <PersonNode
                key={person.id}
                person={{ ...person, reports: [] }}
                isLast={j === g.people.length - 1}
                depth={2}
                ancestorLast={[false, i === groups.length - 1 && !hasUnassigned]}
                defaultOpen={false}
              />
            ))}
          </GroupNode>
        ))}
        {/* Unassigned bucket */}
        {hasUnassigned ? (
          <GroupNode
            name="Unassigned"
            icon={<Inbox className="size-2.5" style={{ color: "var(--color-ink-500)" }} />}
            iconBg="var(--color-paper-2)"
            sub={`${unassigned.length} ${unassigned.length === 1 ? "person" : "people"}`}
            count={unassigned.length}
            depth={1}
            isLast
            ancestorLast={[false]}
          >
            {unassigned.map((person, j) => (
              <PersonNode
                key={person.id}
                person={{ ...person, reports: [] }}
                isLast={j === unassigned.length - 1}
                depth={2}
                ancestorLast={[false, true]}
                defaultOpen={false}
              />
            ))}
          </GroupNode>
        ) : null}
      </GroupNode>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GROUP NODE — a collapsible container (Company / Project / Department)
   ═══════════════════════════════════════════════════════════════════════════ */
function GroupNode({
  name,
  icon,
  iconBg,
  sub,
  count,
  defaultOpen,
  depth,
  isLast,
  ancestorLast,
  children,
}: {
  name: string;
  icon: React.ReactNode;
  iconBg: string;
  sub: string;
  count: number;
  defaultOpen?: boolean;
  depth: number;
  isLast: boolean;
  ancestorLast: boolean[];
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div>
      <TreeRow
        depth={depth}
        isLast={isLast}
        ancestorLast={ancestorLast}
        icon={icon}
        iconBg={iconBg}
        chevron
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={name}
        nameBold={depth === 0}
        nameOnClick={() => setOpen((o) => !o)}
        sub={sub}
        right={
          <span
            className="text-m-caption font-bold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-500)" }}
          >
            {count}
          </span>
        }
      />
      {open && children ? <div>{children}</div> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PERSON NODE — a person with expandable detail

   People with reports or teams render as FOLDER-style (folder icon + count),
   matching the "higher hierarchy = folder" pattern. Leaf people (no reports,
   no teams) render as person rows with a person icon.
   ═══════════════════════════════════════════════════════════════════════════ */
function PersonNode({
  person,
  isLast,
  depth,
  ancestorLast,
  defaultOpen,
}: {
  person: OrgPersonNode;
  isLast: boolean;
  depth: number;
  ancestorLast: boolean[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  // Turbopack RSC serialization can lose recursive `reports`/`teams` arrays
  // (and even primitive fields like `descendantCount`/`hasChildren`) when
  // passing complex nested objects from Server → Client components.
  // We use a `mounted` state to defer the folder/leaf icon decision to after
  // hydration, ensuring server and client render the same initial icon.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  const ts = tierStyle(person.tier);
  const hasReports = (person.reports?.length ?? 0) > 0;
  const hasTeams = (person.teams?.length ?? 0) > 0;
  const hasDetail =
    (person.scopes?.length ?? 0) > 0 ||
    (person.openTasks?.length ?? 0) > 0 ||
    (person.recentDprs?.length ?? 0) > 0 ||
    !!person.email ||
    !!person.phone ||
    (person.taskSummary?.pending ?? 0) > 0 ||
    (person.taskSummary?.inProgress ?? 0) > 0 ||
    (person.taskSummary?.completed ?? 0) > 0 ||
    (person.taskSummary?.overdue ?? 0) > 0 ||
    (person.taskSummary?.dueToday ?? 0) > 0 ||
    (person.teams?.length ?? 0) > 0 ||
    !!person.attendance ||
    (person.leave?.pendingRequests ?? 0) > 0 ||
    person.leave?.onLeaveToday === true;
  const isFolder = person.hasChildren === true || hasReports || hasTeams;
  // Before mount, always render as a leaf (CircleUser) to match the client's
  // initial render (where nested data is lost). After mount, use the real value.
  // NOTE: `effectiveIsFolder` only affects the ICON, not expandability —
  // the card should always be expandable if there's data or children.
  const effectiveIsFolder = mounted ? isFolder : false;
  const expandable = isFolder || hasDetail;
  const subParts = [person.designation, person.employeeCode].filter(Boolean);
  const sub = subParts.length > 0 ? subParts.join(" · ") : undefined;

  // Right-side content: descendant count for folders, task count for leaves
  const rightContent = effectiveIsFolder ? (
    <span
      className="text-m-caption font-bold tabular-nums shrink-0"
      style={{ color: "var(--color-ink-500)" }}
    >
      {person.descendantCount}
    </span>
  ) : person.openTaskCount > 0 ? (
    <span
      className="inline-flex items-center gap-0.5 text-m-caption font-bold tabular-nums shrink-0"
      style={{ color: "var(--color-signal-dark)" }}
    >
      <ClipboardList className="size-2.5" />
      {person.openTaskCount}
    </span>
  ) : null;

  return (
    <div>
      <TreeRow
        depth={depth}
        isLast={isLast}
        ancestorLast={ancestorLast}
        icon={
          effectiveIsFolder ? (
            open ? (
              <FolderOpen className="size-2.5" style={{ color: ts.fg }} />
            ) : (
              <Folder className="size-2.5" style={{ color: ts.fg }} />
            )
          ) : (
            <CircleUser className="size-2.5" style={{ color: ts.fg }} />
          )
        }
        iconBg={ts.bg}
        chevron={expandable}
        chevronOpen={open}
        onChevronClick={() => expandable && setOpen((o) => !o)}
        name={person.name}
        nameHref={`/m/settings/team`}
        nameOnClick={expandable ? () => setOpen((o) => !o) : undefined}
        nameBold={person.tier <= 2}
        badge={person.isSelf ? "You" : undefined}
        roleTag={person.roleLabel}
        roleTagBg={ts.bg}
        roleTagFg={ts.fg}
        sub={sub}
        right={rightContent}
        callHref={person.phone ? `tel:${person.phone}` : undefined}
      />

      {open && expandable ? (
        <PersonDetail person={person} depth={depth + 1} ancestorLast={[...ancestorLast, isLast]} />
      ) : null}

      {/* Teams (crews) led by this person */}
      {open && hasTeams ? (
        <div>
          {person.teams.map((team, i) => (
            <TeamNode
              key={team.id}
              team={team}
              isLast={i === person.teams.length - 1 && !hasReports}
              depth={depth + 1}
              ancestorLast={[...ancestorLast, isLast]}
            />
          ))}
        </div>
      ) : null}

      {open && hasReports ? (
        <div>
          {person.reports.map((report, i) => (
            <PersonNode
              key={report.id}
              person={report}
              isLast={i === person.reports.length - 1}
              depth={depth + 1}
              ancestorLast={[...ancestorLast, isLast]}
              defaultOpen={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEAM NODE — a crew with its member workers
   ═══════════════════════════════════════════════════════════════════════════ */
function TeamNode({
  team,
  isLast,
  depth,
  ancestorLast,
}: {
  team: OrgTeamNode;
  isLast: boolean;
  depth: number;
  ancestorLast: boolean[];
}) {
  const [open, setOpen] = React.useState(false);
  const subParts = [team.trade, team.projectName].filter(Boolean);
  const sub = subParts.length > 0 ? subParts.join(" · ") : `${team.members.length} members`;
  return (
    <div>
      <TreeRow
        depth={depth}
        isLast={isLast}
        ancestorLast={ancestorLast}
        icon={<Users className="size-2.5" style={{ color: "var(--color-ink-700)" }} />}
        iconBg="var(--color-concrete)"
        chevron
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={team.name}
        nameOnClick={() => setOpen((o) => !o)}
        nameBold={false}
        sub={sub}
        right={
          <span
            className="text-m-caption font-bold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-500)" }}
          >
            {team.members.length}
          </span>
        }
      />
      {open ? (
        <div>
          {team.members.map((member, i) => (
            <MemberNode
              key={member.id}
              member={member}
              isLast={i === team.members.length - 1}
              depth={depth + 1}
              ancestorLast={[...ancestorLast, isLast]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER NODE — a field worker (Employee, not a User)
   ═══════════════════════════════════════════════════════════════════════════ */
function MemberNode({
  member,
  isLast,
  depth,
  ancestorLast,
}: {
  member: OrgMemberNode;
  isLast: boolean;
  depth: number;
  ancestorLast: boolean[];
}) {
  const subParts = [member.designation, member.activeProjectName].filter(Boolean);
  const sub = subParts.length > 0 ? subParts.join(" · ") : member.trade ?? "Worker";
  return (
    <TreeRow
      depth={depth}
      isLast={isLast}
      ancestorLast={ancestorLast}
      icon={<HardHat className="size-2.5" style={{ color: "var(--color-ink-500)" }} />}
      iconBg="var(--color-paper-2)"
      chevron={false}
      name={member.name}
      nameHref="/m/hr/employees"
      nameBold={false}
      sub={sub}
      right={
        !member.active ? (
          <span
            className="text-m-caption font-bold shrink-0"
            style={{ color: "var(--color-ink-400)" }}
          >
            Inactive
          </span>
        ) : null
      }
      callHref={member.phone ? `tel:${member.phone}` : undefined}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PERSON DETAIL — expanded panel under a person row

   Sections (top → bottom):
     1. Status row — inactive / on-leave / attendance badge (NO role badge
        — that's already shown in the TreeRow name line as `roleTag`)
     2. Task summary — chips: pending, in-progress, overdue, due today, done
     3. Assignment — scope chips (project / department) + today's site
     4. Resources — crews/teams led with member counts
     5. Open tasks — list of active tasks (links to /m/site/tasks)
     6. Recent DPRs — last 3 submitted reports
     7. Contact — email + phone
   ═══════════════════════════════════════════════════════════════════════════ */
function PersonDetail({ person, depth, ancestorLast }: { person: OrgPersonNode; depth: number; ancestorLast: boolean[] }) {
  const ts = person.taskSummary ?? { pending: 0, inProgress: 0, completed: 0, overdue: 0, dueToday: 0 };
  const hasTaskSummary = ts.pending + ts.inProgress + ts.completed + ts.overdue + ts.dueToday > 0;
  const att = person.attendance;
  const leave = person.leave;
  const hasTeams = (person.teams?.length ?? 0) > 0;
  const totalTeamMembers = person.teams?.reduce((sum, t) => sum + (t.members?.length ?? 0), 0) ?? 0;

  return (
    <div className="flex">
      {/* ── Connector columns — continue vertical lines through the detail card ── */}
      {Array.from({ length: depth }, (_, i) => {
        const isElbowLevel = i === depth - 1;
        const ancestorWasLast = ancestorLast[i] ?? false;
        if (!isElbowLevel && ancestorWasLast) {
          return <div key={i} className="shrink-0" style={{ width: INDENT_PX }} />;
        }
        return (
          <div key={i} className="relative shrink-0" style={{ width: INDENT_PX }}>
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: 0, bottom: 0, width: 1, backgroundColor: "var(--color-line)" }}
            />
          </div>
        );
      })}
      <div className="shrink-0" style={{ width: 24 }} />
      <div
        className="flex-1 mb-1 rounded-[0.375rem] border p-2 space-y-2"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper-2)",
        }}
      >
      {/* ── 1. Status row (no role badge — it's in the TreeRow) ── */}
      {!person.active ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="inline-block rounded px-1.5 py-px text-m-caption font-bold uppercase"
            style={{ backgroundColor: "var(--color-stop-wash)", color: "var(--color-stop)" }}
          >
            Inactive
          </span>
        </div>
      ) : null}

      {/* ── 2. Task summary — chips with counts ── */}
      {hasTaskSummary ? (
        <div className="space-y-1">
          <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Tasks
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {ts.pending > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-semibold"
                style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
              >
                <Inbox className="size-2" />
                {ts.pending} pending
              </span>
            ) : null}
            {ts.inProgress > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-semibold"
                style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
              >
                <Clock className="size-2" />
                {ts.inProgress} ongoing
              </span>
            ) : null}
            {ts.dueToday > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-semibold"
                style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
              >
                <CalendarClock className="size-2" />
                {ts.dueToday} today
              </span>
            ) : null}
            {ts.overdue > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-bold"
                style={{ backgroundColor: "var(--color-stop-wash)", color: "var(--color-stop)" }}
              >
                <AlertTriangle className="size-2" />
                {ts.overdue} overdue
              </span>
            ) : null}
            {ts.completed > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-semibold"
                style={{ backgroundColor: "var(--color-go-wash)", color: "var(--color-go-dark)" }}
              >
                <CheckCircle2 className="size-2" />
                {ts.completed} done
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── 3. Assignment — where they're assigned ── */}
      {(person.scopes?.length ?? 0) > 0 || att?.projectName ? (
        <div className="space-y-1">
          <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Assigned to
          </p>
          <div className="flex items-start gap-1 flex-wrap">
            {person.scopes?.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption"
                style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
              >
                {s.kind === "PROJECT" ? <HardHat className="size-2" /> : <Layers className="size-2" />}
                {s.projectName ?? s.departmentName ?? s.kind}
              </span>
            ))}
            {att?.projectName ? (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption"
                style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
              >
                <MapPin className="size-2" />
                {att.projectName} (today)
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── 3b. Attendance + leave status ── */}
      {att || leave?.onLeaveToday || (leave?.pendingRequests ?? 0) > 0 ? (
        <div className="flex items-center gap-1 flex-wrap">
          {leave?.onLeaveToday ? (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-bold uppercase"
              style={{ backgroundColor: "var(--color-stop-wash)", color: "var(--color-stop)" }}
            >
              <CalendarX className="size-2" />
              On leave
            </span>
          ) : att?.status ? (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption font-semibold"
              style={{
                backgroundColor:
                  att.status === "PRESENT" || att.status === "OVERTIME"
                    ? "var(--color-go-wash)"
                    : att.status === "ABSENT"
                      ? "var(--color-stop-wash)"
                      : "var(--color-concrete)",
                color:
                  att.status === "PRESENT" || att.status === "OVERTIME"
                    ? "var(--color-go-dark)"
                    : att.status === "ABSENT"
                      ? "var(--color-stop)"
                      : "var(--color-ink-700)",
              }}
            >
              <UserCheck className="size-2" />
              {att.status.replace(/_/g, " ").toLowerCase()}
              {att.checkIn
                ? ` · ${new Date(att.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
          ) : null}
          {(leave?.pendingRequests ?? 0) > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-m-caption"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
            >
              <CalendarDays className="size-2" />
              {leave!.pendingRequests} leave pending
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── 4. Resources — crews/teams led ── */}
      {hasTeams ? (
        <div className="space-y-1">
          <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Resources
          </p>
          {person.teams.map((team) => (
            <div key={team.id} className="flex items-center gap-1.5 text-m-label">
              <Users className="size-2.5 shrink-0" style={{ color: "var(--color-ink-400)" }} />
              <span className="truncate flex-1" style={{ color: "var(--color-ink-700)" }}>
                {team.name}
              </span>
              <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-400)" }}>
                {team.members?.length ?? 0} {team.trade ? `· ${team.trade}` : ""}
              </span>
            </div>
          ))}
          {totalTeamMembers > 0 ? (
            <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              {totalTeamMembers} total field {totalTeamMembers === 1 ? "worker" : "workers"}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── 5. Open tasks — list ── */}
      {(person.openTasks?.length ?? 0) > 0 ? (
        <div className="space-y-1">
          <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Open tasks
          </p>
          {person.openTasks.slice(0, 4).map((t) => (
            <Link
              key={t.id}
              href="/m/site/tasks"
              className="flex items-center gap-1.5 text-m-label press"
            >
              <ClipboardList className="size-2.5 shrink-0" style={{ color: "var(--color-ink-400)" }} />
              <span className="truncate flex-1" style={{ color: "var(--color-ink-700)" }}>
                {t.title}
              </span>
              {t.priority === "urgent" || t.priority === "high" ? (
                <span
                  className="text-m-caption font-bold uppercase shrink-0"
                  style={{ color: "var(--color-stop)" }}
                >
                  {t.priority}
                </span>
              ) : null}
            </Link>
          ))}
          {(person.openTaskCount ?? 0) > (person.openTasks?.length ?? 0) ? (
            <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              +{(person.openTaskCount ?? 0) - (person.openTasks?.length ?? 0)} more
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── 6. Recent DPRs ── */}
      {(person.recentDprs?.length ?? 0) > 0 ? (
        <div className="space-y-1">
          <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
            Recent DPRs
          </p>
          {person.recentDprs.slice(0, 3).map((d) => (
            <Link
              key={d.id}
              href={`/m/dprs/${d.id}`}
              className="flex items-center gap-1.5 text-m-label press"
            >
              <FileText className="size-2.5 shrink-0" style={{ color: "var(--color-ink-400)" }} />
              <span className="truncate flex-1" style={{ color: "var(--color-ink-700)" }}>
                {d.projectName}
              </span>
              <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-400)" }}>
                {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {/* ── 7. Contact ── */}
      {(person.email || person.phone) && (
        <div className="flex items-center gap-3 flex-wrap">
          {person.email ? (
            <a
              href={`mailto:${person.email}`}
              className="inline-flex items-center gap-1 text-m-caption press"
              style={{ color: "var(--color-ink-500)" }}
            >
              <Mail className="size-2.5" />
              {person.email}
            </a>
          ) : null}
          {person.phone ? (
            <a
              href={`tel:${person.phone}`}
              className="inline-flex items-center gap-1 text-m-caption press"
              style={{ color: "var(--color-ink-500)" }}
            >
              <Phone className="size-2.5" />
              {person.phone}
            </a>
          ) : null}
        </div>
      )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TREE ROW — the shared row primitive

   Draws proper tree connectors using an `ancestorLast` array that tracks
   whether each ancestor was the last child at its level. This is what makes
   the branching correct:
     - An ancestor that WAS the last child → no vertical line continues down
     - An ancestor that was NOT the last child → vertical line continues
     - The immediate parent (elbow level) → ├ or └ depending on `isLast`

   Handles:
   - Connector lines for all ancestor depths (with correct continuation)
   - Elbow connector for this row's position (├ or └)
   - Optional chevron for collapsible nodes
   - Icon, name (link), sub-label, right-aligned content
   ═══════════════════════════════════════════════════════════════════════════ */
function TreeRow({
  depth,
  isLast,
  ancestorLast,
  icon,
  iconBg,
  chevron,
  chevronOpen,
  onChevronClick,
  name,
  nameHref,
  nameOnClick,
  nameBold,
  badge,
  roleTag,
  roleTagBg,
  roleTagFg,
  sub,
  right,
  callHref,
  paddingTop,
}: {
  depth: number;
  isLast: boolean;
  ancestorLast: boolean[];
  icon: React.ReactNode;
  iconBg: string;
  chevron?: boolean;
  chevronOpen?: boolean;
  onChevronClick?: () => void;
  name: string;
  nameHref?: string;
  nameOnClick?: () => void;
  nameBold?: boolean;
  badge?: string;
  /** Role label tag rendered right after the name (e.g. "OWNER", "ADMIN"). */
  roleTag?: string;
  roleTagBg?: string;
  roleTagFg?: string;
  sub?: string;
  right?: React.ReactNode;
  /** If set, renders a phone call button at the rightmost end of the row. */
  callHref?: string;
  paddingTop?: boolean;
}) {
  const rowH = 24;

  return (
    <div className="flex items-center" style={{ height: rowH, paddingTop: paddingTop ? 2 : 0 }}>
      {/* ── Connector columns for each ancestor depth ── */}
      {Array.from({ length: depth }, (_, i) => {
        const isElbowLevel = i === depth - 1;
        const ancestorWasLast = ancestorLast[i] ?? false;

        if (!isElbowLevel && ancestorWasLast) {
          return (
            <div key={i} className="relative shrink-0" style={{ width: INDENT_PX, height: rowH }} />
          );
        }

        return (
          <div
            key={i}
            className="relative shrink-0"
            style={{ width: INDENT_PX, height: rowH }}
          >
            {isElbowLevel ? (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: 0,
                    width: 1,
                    height: isLast ? rowH / 2 : rowH,
                    backgroundColor: "var(--color-line)",
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    left: "50%",
                    width: INDENT_PX / 2,
                    height: 1,
                    backgroundColor: "var(--color-line)",
                  }}
                />
              </>
            ) : (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: "var(--color-line)",
                }}
              />
            )}
          </div>
        );
      })}

      {/* ── Chevron (or spacer) ── */}
      <div className="shrink-0 w-4 flex items-center justify-center">
        {chevron ? (
          <button type="button" onClick={onChevronClick} className="text-m-body press">
            <ChevronRight
              className="size-3 transition-transform"
              style={{
                color: "var(--color-ink-500)",
                transform: chevronOpen ? "rotate(90deg)" : "none",
              }}
            />
          </button>
        ) : null}
      </div>

      {/* ── Icon ── */}
      <span
        className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </span>

      {/* ── Name + role tag + badge ── */}
      {nameHref ? (
        <Link
          href={nameHref}
          onClick={nameOnClick}
          className={`min-w-0 truncate press ml-1.5 ${nameBold ? "text-m-body font-bold" : "text-m-label font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{name}</span>
          {roleTag ? (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-m-caption font-bold uppercase align-middle shrink-0"
              style={{
                backgroundColor: roleTagBg ?? "var(--color-concrete)",
                color: roleTagFg ?? "var(--color-ink-700)",
              }}
            >
              {roleTag}
            </span>
          ) : null}
          {badge ? (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-m-caption font-bold uppercase align-middle shrink-0"
              style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
            >
              {badge}
            </span>
          ) : null}
        </Link>
      ) : (
        <button
          type="button"
          onClick={nameOnClick}
          className={`min-w-0 truncate text-left press ml-1.5 ${nameBold ? "text-m-body font-bold" : "text-m-label font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{name}</span>
          {roleTag ? (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-m-caption font-bold uppercase align-middle shrink-0"
              style={{
                backgroundColor: roleTagBg ?? "var(--color-concrete)",
                color: roleTagFg ?? "var(--color-ink-700)",
              }}
            >
              {roleTag}
            </span>
          ) : null}
          {badge ? (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-m-caption font-bold uppercase align-middle shrink-0"
              style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
            >
              {badge}
            </span>
          ) : null}
        </button>
      )}

      {/* ── Sub-label ── */}
      {sub ? (
        <span className="text-m-caption shrink-0 ml-1 truncate max-w-[30%]" style={{ color: "var(--color-ink-400)" }}>
          {sub}
        </span>
      ) : null}

      {/* ── Right content (count / task badge) ── */}
      {right ? <div className="shrink-0 ml-1.5">{right}</div> : null}

      {/* ── Call button (rightmost) ── */}
      {callHref ? (
        <a
          href={callHref}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 ml-1 grid place-items-center size-5 rounded-[0.25rem] press"
          style={{
            color: "var(--color-signal-dark)",
            backgroundColor: "var(--color-signal-wash)",
          }}
          aria-label={`Call ${name}`}
        >
          <Phone className="size-2.5" />
        </a>
      ) : null}
    </div>
  );
}

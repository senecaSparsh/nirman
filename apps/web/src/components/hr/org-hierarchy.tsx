"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Building2,
  HardHat,
  Layers,
  Inbox,
  CircleUser,
  Mail,
  Phone,
  ClipboardList,
  FileText,
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
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardToolbar } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import type {
  OrgTreeData,
  OrgPersonNode,
  OrgAssignmentGroup,
  OrgTeamNode,
  OrgMemberNode,
} from "@/app/m/hr/OrgHierarchy";

/* ═══════════════════════════════════════════════════════════════════════════
   DESKTOP ORG HIERARCHY — same tree, wider rows, shadcn styling.

   Two views toggled at the top:
     1. Reporting line  — manager → direct reports (org chart)
     2. By assignment    — Company → Project / Department → people
   ═══════════════════════════════════════════════════════════════════════════ */

const INDENT_PX = 28;

const TIER_BADGE: Record<number, string> = {
  1: "border-transparent bg-primary text-primary-foreground",
  2: "border-info-border bg-info-soft text-info",
  3: "border-brand-border bg-brand-soft text-brand-strong",
  4: "border-border-strong bg-muted text-foreground",
  5: "border-transparent bg-subtle text-muted-foreground",
};
function tierBadgeClass(tier: number) {
  return TIER_BADGE[tier] ?? TIER_BADGE[5]!;
}

export function OrgHierarchyDesktop({ tree }: { tree: OrgTreeData }) {
  const [view, setView] = React.useState<"reporting" | "assignment">("reporting");

  return (
    <Card>
      <CardHeader divided>
        <CardToolbar>
          <div className="flex items-center gap-2">
            <CardTitle>Organization</CardTitle>
            <Badge variant="muted" size="sm">
              {tree.peopleCount} {tree.peopleCount === 1 ? "person" : "people"}
            </Badge>
          </div>
          {/* View toggle */}
          <div className="flex rounded-md border border-border bg-subtle p-0.5">
            <ToggleButtonD active={view === "reporting"} onClick={() => setView("reporting")}>
              Reporting line
            </ToggleButtonD>
            <ToggleButtonD active={view === "assignment"} onClick={() => setView("assignment")}>
              By assignment
            </ToggleButtonD>
          </div>
        </CardToolbar>
      </CardHeader>
      <CardContent className="p-2">
        {tree.peopleCount === 0 && tree.labourCount === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No team members yet"
            size="compact"
          />
        ) : view === "reporting" ? (
          <ReportingTreeD
            roots={tree.roots}
            labourByTrade={tree.labourByTrade}
            labourCount={tree.labourCount}
          />
        ) : (
          <AssignmentTreeD
            companyName={tree.companyName}
            projects={tree.projects}
            departments={tree.departments}
            unassigned={tree.unassigned}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ToggleButtonD({
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
      className={cn(
        "rounded-[5px] px-3 py-1 text-meta font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   REPORTING TREE — OWNER → ADMIN → managers → supervisors → teams
   ═══════════════════════════════════════════════════════════════════════════ */
function ReportingTreeD({
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
      <EmptyState
        icon={<Users />}
        title="No reporting lines set up"
        size="compact"
      />
    );
  }
  const hasLabour = labourByTrade.length > 0;
  return (
    <div className="flex flex-col">
      {roots.map((person, i) => (
        <PersonNodeD
          key={person.id}
          person={person}
          isLast={i === roots.length - 1 && !hasLabour}
          depth={0}
          ancestorLast={[]}
          defaultOpen={roots.length <= 2}
        />
      ))}
      {hasLabour ? (
        <GroupNodeD
          name="Field Labour"
          icon={<Wrench className="size-3.5 text-muted-foreground" />}
          iconClass="bg-muted"
          sub={`${labourCount} ${labourCount === 1 ? "worker" : "workers"} · ${labourByTrade.length} trades`}
          count={labourCount}
          defaultOpen={false}
          depth={0}
          isLast
          ancestorLast={[]}
        >
          {labourByTrade.map((group, i) => (
            <GroupNodeD
              key={group.trade}
              name={group.trade}
              icon={<HardHat className="size-3.5 text-muted-foreground" />}
              iconClass="bg-subtle"
              sub={`${group.members.length} ${group.members.length === 1 ? "worker" : "workers"}`}
              count={group.members.length}
              depth={1}
              isLast={i === labourByTrade.length - 1}
              ancestorLast={[true]}
            >
              {group.members.map((member, j) => (
                <MemberNodeD
                  key={member.id}
                  member={member}
                  isLast={j === group.members.length - 1}
                  depth={2}
                  ancestorLast={[true, i === labourByTrade.length - 1]}
                />
              ))}
            </GroupNodeD>
          ))}
        </GroupNodeD>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSIGNMENT TREE
   ═══════════════════════════════════════════════════════════════════════════ */
function AssignmentTreeD({
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
    ...projects.map((p) => ({ ...p, icon: <HardHat className="size-3.5" />, iconClass: "text-foreground" })),
    ...departments.map((d) => ({ ...d, icon: <Layers className="size-3.5" />, iconClass: "text-info" })),
  ];
  const hasUnassigned = unassigned.length > 0;

  return (
    <div className="flex flex-col">
      <GroupNodeD
        name={companyName}
        icon={<Building2 className="size-3.5 text-primary-foreground" />}
        iconClass="bg-primary"
        sub={`${projects.length + departments.length} groups · ${unassigned.length} unassigned`}
        count={projects.reduce((s, p) => s + p.people.length, 0) + departments.reduce((s, d) => s + d.people.length, 0) + unassigned.length}
        defaultOpen
        depth={0}
        isLast={false}
        ancestorLast={[]}
      >
        {groups.map((g, i) => (
          <GroupNodeD
            key={g.id}
            name={g.name}
            icon={g.icon}
            iconClass={cn("bg-subtle", g.iconClass)}
            sub={`${g.people.length} ${g.people.length === 1 ? "person" : "people"}`}
            count={g.people.length}
            depth={1}
            isLast={i === groups.length - 1 && !hasUnassigned}
            ancestorLast={[false]}
          >
            {g.people.map((person, j) => (
              <PersonNodeD
                key={person.id}
                person={{ ...person, reports: [] }}
                isLast={j === g.people.length - 1}
                depth={2}
                ancestorLast={[false, i === groups.length - 1 && !hasUnassigned]}
                defaultOpen={false}
              />
            ))}
          </GroupNodeD>
        ))}
        {hasUnassigned ? (
          <GroupNodeD
            name="Unassigned"
            icon={<Inbox className="size-3.5 text-muted-foreground" />}
            iconClass="bg-subtle"
            sub={`${unassigned.length} ${unassigned.length === 1 ? "person" : "people"}`}
            count={unassigned.length}
            depth={1}
            isLast
            ancestorLast={[false]}
          >
            {unassigned.map((person, j) => (
              <PersonNodeD
                key={person.id}
                person={{ ...person, reports: [] }}
                isLast={j === unassigned.length - 1}
                depth={2}
                ancestorLast={[false, true]}
                defaultOpen={false}
              />
            ))}
          </GroupNodeD>
        ) : null}
      </GroupNodeD>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GROUP NODE
   ═══════════════════════════════════════════════════════════════════════════ */
function GroupNodeD({
  name,
  icon,
  iconClass,
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
  iconClass: string;
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
      <TreeRowD
        depth={depth}
        isLast={isLast}
        ancestorLast={ancestorLast}
        icon={icon}
        iconClass={iconClass}
        chevron
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={name}
        nameBold={depth === 0}
        nameOnClick={() => setOpen((o) => !o)}
        sub={sub}
        right={
          <Badge variant="muted" size="sm">
            {count}
          </Badge>
        }
      />
      {open && children ? <div>{children}</div> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PERSON NODE
   ═══════════════════════════════════════════════════════════════════════════ */
function PersonNodeD({
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
  const hasReports = (person.reports?.length ?? 0) > 0;
  const hasTeams = (person.teams?.length ?? 0) > 0;
  const hasDetail =
    (person.scopes?.length ?? 0) > 0 ||
    (person.openTasks?.length ?? 0) > 0 ||
    (person.recentDprs?.length ?? 0) > 0 ||
    !!person.email ||
    !!person.phone;
  const isFolder = person.hasChildren === true || hasReports || hasTeams;
  const effectiveIsFolder = mounted ? isFolder : false;
  const expandable = effectiveIsFolder || hasDetail;
  const subParts = [person.designation, person.employeeCode].filter(Boolean);
  const sub = subParts.length > 0 ? subParts.join(" · ") : undefined;

  const rightContent = effectiveIsFolder ? (
    <Badge variant="muted" size="sm">{person.descendantCount}</Badge>
  ) : (person.openTaskCount ?? 0) > 0 ? (
    <span className="inline-flex items-center gap-1 text-meta font-semibold tabular-nums text-warning">
      <ClipboardList className="size-3" />
      {person.openTaskCount} open
    </span>
  ) : null;

  return (
    <div>
      <TreeRowD
        depth={depth}
        isLast={isLast}
        ancestorLast={ancestorLast}
        icon={
          effectiveIsFolder ? (
            open ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />
          ) : (
            <CircleUser className="size-3.5" />
          )
        }
        iconClass="bg-muted"
        chevron={expandable}
        chevronOpen={open}
        onChevronClick={() => expandable && setOpen((o) => !o)}
        name={person.name}
        nameHref="/settings/team"
        nameOnClick={expandable ? () => setOpen((o) => !o) : undefined}
        nameBold={person.tier <= 2}
        roleTag={person.roleLabel}
        roleTagClass={tierBadgeClass(person.tier)}
        badge={
          <span className="flex items-center gap-1.5">
            {person.isSelf ? <Badge variant="brand" size="sm">You</Badge> : null}
            {!person.active ? <Badge variant="danger" size="sm">Inactive</Badge> : null}
          </span>
        }
        sub={sub}
        right={rightContent}
        callHref={person.phone ? `tel:${person.phone}` : undefined}
      />

      {open && expandable ? <PersonDetailD person={person} depth={depth + 1} ancestorLast={[...ancestorLast, isLast]} /> : null}

      {open && hasTeams ? (
        <div>
          {person.teams.map((team, i) => (
            <TeamNodeD
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
            <PersonNodeD
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
   TEAM NODE (desktop) — a crew with its member workers
   ═══════════════════════════════════════════════════════════════════════════ */
function TeamNodeD({
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
      <TreeRowD
        depth={depth}
        isLast={isLast}
        ancestorLast={ancestorLast}
        icon={<Users className="size-3.5 text-muted-foreground" />}
        iconClass="bg-subtle"
        chevron
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={team.name}
        nameOnClick={() => setOpen((o) => !o)}
        nameBold={false}
        sub={sub}
        right={<Badge variant="muted" size="sm">{team.members.length}</Badge>}
      />
      {open ? (
        <div>
          {team.members.map((member, i) => (
            <MemberNodeD
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
   MEMBER NODE (desktop) — a field worker (Employee, not a User)
   ═══════════════════════════════════════════════════════════════════════════ */
function MemberNodeD({
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
    <TreeRowD
      depth={depth}
      isLast={isLast}
      ancestorLast={ancestorLast}
      icon={<HardHat className="size-3.5 text-muted-foreground" />}
      iconClass="bg-subtle"
      chevron={false}
      name={member.name}
      nameHref="/hr/employees"
      nameBold={false}
      sub={sub}
      right={
        !member.active ? (
          <Badge variant="danger" size="sm">Inactive</Badge>
        ) : null
      }
      callHref={member.phone ? `tel:${member.phone}` : undefined}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PERSON DETAIL (desktop) — mirrors the mobile PersonDetail structure
   ═══════════════════════════════════════════════════════════════════════════ */
function PersonDetailD({ person, depth, ancestorLast }: { person: OrgPersonNode; depth: number; ancestorLast: boolean[] }) {
  const ts = person.taskSummary;
  const hasTaskSummary = ts && (ts.pending + ts.inProgress + ts.completed + ts.overdue + ts.dueToday > 0);
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
              style={{ top: 0, bottom: 0, width: 1, backgroundColor: "var(--color-border, hsl(var(--border)))" }}
            />
          </div>
        );
      })}
      <div className="shrink-0" style={{ width: 32 }} />
      <div
        className="flex-1 mb-1 rounded-md border border-border bg-subtle p-3 space-y-2.5"
      >
      {/* ── Inactive badge (role badge is in the TreeRow) ── */}
      {!person.active ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="danger" size="sm" className="uppercase">Inactive</Badge>
        </div>
      ) : null}

      {/* ── Task summary ── */}
      {hasTaskSummary ? (
        <div className="space-y-1">
          <p className="text-meta font-semibold uppercase text-muted-foreground">Tasks</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ts!.pending > 0 ? (
              <Badge variant="muted" size="sm">
                <Inbox className="size-3" />
                {ts!.pending} pending
              </Badge>
            ) : null}
            {ts!.inProgress > 0 ? (
              <Badge variant="muted" size="sm">
                <Clock className="size-3" />
                {ts!.inProgress} ongoing
              </Badge>
            ) : null}
            {ts!.dueToday > 0 ? (
              <Badge variant="muted" size="sm">
                <CalendarClock className="size-3" />
                {ts!.dueToday} today
              </Badge>
            ) : null}
            {ts!.overdue > 0 ? (
              <Badge variant="danger" size="sm">
                <AlertTriangle className="size-3" />
                {ts!.overdue} overdue
              </Badge>
            ) : null}
            {ts!.completed > 0 ? (
              <Badge variant="success" size="sm">
                <CheckCircle2 className="size-3" />
                {ts!.completed} done
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Assignment ── */}
      {(person.scopes?.length ?? 0) > 0 || att?.projectName ? (
        <div className="space-y-1">
          <p className="text-meta font-semibold uppercase text-muted-foreground">Assigned to</p>
          <div className="flex items-start gap-1.5 flex-wrap">
            {person.scopes?.map((s, i) => (
              <Badge key={i} variant="muted" size="sm">
                {s.kind === "PROJECT" ? <HardHat className="size-3" /> : <Layers className="size-3" />}
                {s.projectName ?? s.departmentName ?? s.kind}
              </Badge>
            ))}
            {att?.projectName ? (
              <Badge variant="muted" size="sm">
                <MapPin className="size-3" />
                {att.projectName} (today)
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Attendance + leave ── */}
      {att || leave?.onLeaveToday || (leave?.pendingRequests ?? 0) > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {leave?.onLeaveToday ? (
            <Badge variant="danger" size="sm" className="uppercase">
              <CalendarX className="size-3" />
              On leave
            </Badge>
          ) : att?.status ? (
            <Badge
              variant={att.status === "PRESENT" || att.status === "OVERTIME" ? "success" : att.status === "ABSENT" ? "danger" : "muted"}
              size="sm"
            >
              <UserCheck className="size-3" />
              {att.status.replace(/_/g, " ").toLowerCase()}
              {att.checkIn
                ? ` · ${new Date(att.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </Badge>
          ) : null}
          {(leave?.pendingRequests ?? 0) > 0 ? (
            <Badge variant="muted" size="sm">
              <CalendarDays className="size-3" />
              {leave!.pendingRequests} leave pending
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* ── Resources — crews/teams led ── */}
      {hasTeams ? (
        <div className="space-y-1">
          <p className="text-meta font-semibold uppercase text-muted-foreground">Resources</p>
          {person.teams.map((team) => (
            <div key={team.id} className="flex items-center gap-2 text-body">
              <Users className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-muted-foreground">{team.name}</span>
              <span className="text-meta text-muted-foreground shrink-0">
                {team.members?.length ?? 0} {team.trade ? `· ${team.trade}` : ""}
              </span>
            </div>
          ))}
          {totalTeamMembers > 0 ? (
            <p className="text-meta text-muted-foreground">
              {totalTeamMembers} total field {totalTeamMembers === 1 ? "worker" : "workers"}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Open tasks ── */}
      {(person.openTasks?.length ?? 0) > 0 ? (
        <div className="space-y-1">
          <p className="text-meta font-semibold uppercase text-muted-foreground">Open tasks</p>
          {person.openTasks.slice(0, 5).map((t) => (
            <Link
              key={t.id}
              href="/my-tasks"
              className="flex items-center gap-2 text-body hover:text-foreground"
            >
              <ClipboardList className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-muted-foreground">{t.title}</span>
              {(t.priority === "urgent" || t.priority === "high") && (
                <Badge variant="danger" size="sm" className="uppercase">{t.priority}</Badge>
              )}
            </Link>
          ))}
          {(person.openTaskCount ?? 0) > (person.openTasks?.length ?? 0) ? (
            <p className="text-meta text-muted-foreground">
              +{(person.openTaskCount ?? 0) - (person.openTasks?.length ?? 0)} more
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Recent DPRs ── */}
      {(person.recentDprs?.length ?? 0) > 0 ? (
        <div className="space-y-1">
          <p className="text-meta font-semibold uppercase text-muted-foreground">Recent DPRs</p>
          {person.recentDprs.slice(0, 3).map((d) => (
            <Link
              key={d.id}
              href={`/hr/dprs/${d.id}`}
              className="flex items-center gap-2 text-body hover:text-foreground"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-muted-foreground">{d.projectName}</span>
              <span className="text-meta text-muted-foreground shrink-0">
                {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {/* ── Contact ── */}
      {(person.email || person.phone) && (
        <div className="flex items-center gap-4 flex-wrap">
          {person.email ? (
            <a
              href={`mailto:${person.email}`}
              className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3" />
              {person.email}
            </a>
          ) : null}
          {person.phone ? (
            <a
              href={`tel:${person.phone}`}
              className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-3" />
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
   TREE ROW (desktop) — connector lines + chevron + icon + name + badge + sub
   ═══════════════════════════════════════════════════════════════════════════ */
function TreeRowD({
  depth,
  isLast,
  ancestorLast,
  icon,
  iconClass,
  chevron,
  chevronOpen,
  onChevronClick,
  name,
  nameHref,
  nameOnClick,
  nameBold,
  badge,
  roleTag,
  roleTagClass,
  sub,
  right,
  callHref,
}: {
  depth: number;
  isLast: boolean;
  ancestorLast: boolean[];
  icon: React.ReactNode;
  iconClass: string;
  chevron?: boolean;
  chevronOpen?: boolean;
  onChevronClick?: () => void;
  name: string;
  nameHref?: string;
  nameOnClick?: () => void;
  nameBold?: boolean;
  badge?: React.ReactNode;
  roleTag?: string;
  roleTagClass?: string;
  sub?: string;
  right?: React.ReactNode;
  callHref?: string;
}) {
  const rowH = 32;

  return (
    <div className="group flex items-center hover:bg-subtle/50 rounded-md transition-colors" style={{ height: rowH }}>
      {/* Connector columns */}
      {Array.from({ length: depth }, (_, i) => {
        const isElbowLevel = i === depth - 1;
        const ancestorWasLast = ancestorLast[i] ?? false;

        if (!isElbowLevel && ancestorWasLast) {
          return <div key={i} className="relative shrink-0" style={{ width: INDENT_PX, height: rowH }} />;
        }

        return (
          <div key={i} className="relative shrink-0" style={{ width: INDENT_PX, height: rowH }}>
            {isElbowLevel ? (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: 0,
                    width: 1,
                    height: isLast ? rowH / 2 : rowH,
                    backgroundColor: "var(--color-border, hsl(var(--border)))",
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    left: "50%",
                    width: INDENT_PX / 2,
                    height: 1,
                    backgroundColor: "var(--color-border, hsl(var(--border)))",
                  }}
                />
              </>
            ) : (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: 0, bottom: 0, width: 1, backgroundColor: "var(--color-border, hsl(var(--border)))" }}
              />
            )}
          </div>
        );
      })}

      {/* Chevron */}
      <div className="shrink-0 w-5 flex items-center justify-center">
        {chevron ? (
          <button type="button" onClick={onChevronClick} className="text-muted-foreground hover:text-foreground">
            <ChevronRight
              className="size-4 transition-transform"
              style={{ transform: chevronOpen ? "rotate(90deg)" : "none" }}
            />
          </button>
        ) : null}
      </div>

      {/* Icon */}
      <span className={cn("grid place-items-center size-6 rounded shrink-0", iconClass)}>
        {icon}
      </span>

      {/* Name + role tag */}
      {nameHref ? (
        <Link
          href={nameHref}
          onClick={nameOnClick}
          className={cn(
            "min-w-0 truncate ml-2 hover:text-foreground",
            nameBold ? "text-body font-semibold text-foreground" : "text-body text-foreground",
          )}
        >
          <span className="truncate">{name}</span>
          {roleTag ? (
            <Badge
              variant="outline"
              size="sm"
              className={cn("ml-1.5 uppercase align-middle", roleTagClass)}
            >
              {roleTag}
            </Badge>
          ) : null}
        </Link>
      ) : (
        <button
          type="button"
          onClick={nameOnClick}
          className={cn(
            "min-w-0 truncate text-left ml-2",
            nameBold ? "text-body font-semibold text-foreground" : "text-body text-foreground",
          )}
        >
          <span className="truncate">{name}</span>
          {roleTag ? (
            <Badge
              variant="outline"
              size="sm"
              className={cn("ml-1.5 uppercase align-middle", roleTagClass)}
            >
              {roleTag}
            </Badge>
          ) : null}
        </button>
      )}

      {/* Badge (You / Inactive) */}
      {badge ? <div className="shrink-0 ml-2">{badge}</div> : null}

      {/* Sub */}
      {sub ? (
        <span className="text-meta text-muted-foreground shrink-0 ml-2 truncate max-w-[18%]">
          {sub}
        </span>
      ) : null}

      {/* Right */}
      {right ? <div className="shrink-0 ml-2">{right}</div> : null}

      {/* Call button (rightmost) */}
      {callHref ? (
        <a
          href={callHref}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 ml-1.5 mr-1 grid place-items-center size-6 rounded hover:bg-brand-soft transition-colors"
          aria-label={`Call ${name}`}
        >
          <Phone className="size-3.5 text-brand" />
        </a>
      ) : null}
    </div>
  );
}

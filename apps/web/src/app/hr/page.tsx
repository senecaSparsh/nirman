import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, toNum, scopeWhere, getUserPermissions, getEmployeeAccessScope, employeeVisibilityWhere } from "@/lib/server";
import { labourCostFrom } from "@/lib/labour-cost";
import { PERM, migrateRole, ROLES } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { HrDashboard } from "@/components/hr/hr-dashboard";
import { OrgHierarchyDesktop } from "@/components/hr/org-hierarchy";
import type { OrgTreeData } from "@/lib/org-hierarchy-types";
import { buildOrgTree } from "@/lib/org-tree-builder";
import { NoAccess } from "@/components/no-access";
import { DepartmentActivityFeed } from "@/components/department-activity-feed";
import { SettleExitButton } from "@/components/hr/settle-exit-button";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function HrDashboardPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading HR dashboard…" variant="list" />}>
      <HrDashboardContent />
    </Suspense>
  );
}

async function HrDashboardContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const currentUser = await getCurrentUser();

  if (!__effPerms.includes(PERM.HR_VIEW)) {
    return <NoAccess what="the HR module" permission={PERM.HR_VIEW} />;
  }
  // Comp visibility = getEmployeeAccessScope.canSeePayroll (payroll.view |
  // payroll.manage | hr.manage) — use the shared flag so the tier can't drift.
  const { canSeePayroll } = await getEmployeeAccessScope();

  const today = new Date();
  const todayDateOnly = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const cappedLabels: string[] = [];
  const capQ = (label: string, cap = LIST_CAP) => <T,>(rows: T[]): T[] => {
    const r = applyCap(rows, cap);
    if (r.capped) cappedLabels.push(label);
    return r.rows;
  };

  const [
    employeeCount,
    activeEmployees,
    crewCount,
    todayAttendance,
    presentToday,
    absentToday,
    latestPayroll,
    recentDprs,
    pendingPayrolls,
    pendingDprApprovals,
    pendingLeaves,
    pendingAsks,
    pendingCorrections,
    employees,
    weekAttendance,
    todayProjectAttendance,
    orgTree,
  ] = await Promise.all([
    prisma.employee.count({ where: { companyId: company.id, deletedAt: null, ...await employeeVisibilityWhere() } }),
    prisma.employee.count({ where: { companyId: company.id, deletedAt: null, active: true, ...await employeeVisibilityWhere() } }),
    prisma.crew.count({ where: { companyId: company.id, active: true } }),
    prisma.workerAttendance.count({ where: { companyId: company.id, date: todayDateOnly } }),
    prisma.workerAttendance.count({ where: { companyId: company.id, date: todayDateOnly, status: { in: ["PRESENT", "OVERTIME"] } } }),
    prisma.workerAttendance.count({ where: { companyId: company.id, date: todayDateOnly, status: "ABSENT" } }),
    prisma.payrollPeriod.findFirst({
      where: { companyId: company.id, year: { lte: today.getFullYear() + 1 } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { _count: { select: { lines: true } } }}),
    prisma.dailyProgressReport.findMany({
      where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, date: { gte: weekAgo, lte: todayDateOnly } },
      orderBy: { date: "desc" },
      take: 8,
      include: { project: { select: { name: true } }, submittedBy: { select: { name: true } } }}),
    prisma.payrollPeriod.count({ where: { companyId: company.id, status: "DRAFT" } }),
    prisma.dailyProgressReport.count({ where: { companyId: company.id, approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] } } }),
    prisma.leaveRequest.count({ where: { companyId: company.id, status: "PENDING" } }),
    prisma.employeeAdvance.count({ where: { companyId: company.id, status: "REQUESTED" } }),
    prisma.attendanceCorrectionRequest.count({ where: { companyId: company.id, status: "REQUESTED" } }),
    prisma.employee.findMany({
      take: 201,
      where: { companyId: company.id, deletedAt: null, active: true, ...await scopeWhere("Employee") },
      select: { trade: true, dailyRate: true, wageType: true, monthlySalary: true }}).then(capQ("employees", 200)),
    prisma.workerAttendance.findMany({
      take: 201,
      where: {...await scopeWhere("WorkerAttendance"),  companyId: company.id, date: { gte: weekAgo } },
      select: { date: true, status: true }}).then(capQ("weekly attendance", 200)),
    prisma.workerAttendance.findMany({
      take: LIST_CAP + 1,
      where: {...await scopeWhere("WorkerAttendance"),  companyId: company.id, date: todayDateOnly, status: { in: ["PRESENT", "OVERTIME"] } },
      include: { project: { select: { name: true } } }}).then(capQ("today's attendance")),
    loadOrgTree(company.id, company.name, currentUser?.id ?? null, canSeePayroll),
  ]);

  // Compute trade breakdown
  const tradeMap = new Map<string, number>();
  for (const e of employees) {
    const trade = e.trade || "Unspecified";
    tradeMap.set(trade, (tradeMap.get(trade) ?? 0) + 1);
  }
  const tradeBreakdown = Array.from(tradeMap.entries()).map(([trade, count]) => ({ trade, count }));

  // Monthly labour cost — shared computation with the mobile hub
  // (lib/labour-cost.ts) so the two can't drift.
  const monthlyLabourCost = labourCostFrom(employees, latestPayroll, today);

  // Compute 7-day attendance trend
  const trendMap = new Map<string, { present: number; absent: number; leave: number; halfDay: number; overtime: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const dStr = d.toISOString().split("T")[0] ?? "";
    trendMap.set(dStr, { present: 0, absent: 0, leave: 0, halfDay: 0, overtime: 0 });
  }
  for (const r of weekAttendance) {
    const dStr = r.date.toISOString().split("T")[0] ?? "";
    const entry = trendMap.get(dStr);
    if (!entry) continue;
    if (r.status === "PRESENT") entry.present++;
    else if (r.status === "OVERTIME") entry.overtime++;
    else if (r.status === "ABSENT") entry.absent++;
    else if (r.status === "HALF_DAY") entry.halfDay++;
    else if (r.status === "LEAVE") entry.leave++;
  }
  const attendanceTrend = Array.from(trendMap.entries()).map(([date, v]) => ({
    date,
    present: v.present + v.overtime,
    absent: v.absent,
    leave: v.leave,
    halfDay: v.halfDay,
    overtime: v.overtime}));

  // Compute project presence today.
  // The denominator for each project is the number of workers who attended
  // today (PRESENT/OVERTIME) — we don't have a per-project roster, so the
  // share-of-present is the honest metric. Using the global present count
  // (as before) made every project look understaffed.
  const projectMap = new Map<string, number>();
  for (const r of todayProjectAttendance) {
    const name = r.project?.name ?? "Unassigned";
    projectMap.set(name, (projectMap.get(name) ?? 0) + 1);
  }
  const projectPresence = Array.from(projectMap.entries())
    .map(([projectName, present]) => ({ projectName, present, total: presentToday }))
    .sort((a, b) => b.present - a.present);

  const attendanceRate = todayAttendance > 0 ? (presentToday / todayAttendance) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Dashboard"
        description="Daily workforce overview — attendance, pending approvals, and payroll status."
        stats={[
          { label: "Employees", value: employeeCount, hint: "Total employees on record, including inactive ones (soft-deleted excluded)." },
          { label: "Present today", value: presentToday, tone: presentToday > 0 ? "success" : "muted", hint: "Workers marked PRESENT or OVERTIME in today's attendance." },
          { label: "Crews", value: crewCount, hint: "Active worker crews currently registered." },
        ]}
        action={<RefreshButton />}
      />
      <DepartmentActivityFeed department="hr" />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — derived stats below are computed from that subset; older entries are still in the database.`}
        </Hint>
      )}

      <HrDashboard
        employeeCount={employeeCount}
        activeEmployees={activeEmployees}
        crewCount={crewCount}
        presentToday={presentToday}
        absentToday={absentToday}
        totalAttendanceToday={todayAttendance}
        attendanceRate={attendanceRate}
        pendingPayrolls={pendingPayrolls}
        pendingDprApprovals={pendingDprApprovals}
        pendingLeaves={pendingLeaves}
        pendingAsks={pendingAsks + pendingCorrections}
        latestPayroll={latestPayroll ? {
          month: latestPayroll.month,
          year: latestPayroll.year,
          status: latestPayroll.status,
          totalGross: toNum(latestPayroll.totalGross),
          totalDeductions: toNum(latestPayroll.totalDeductions),
          totalNet: toNum(latestPayroll.totalNet),
          employeeCount: latestPayroll._count.lines} : null}
        recentDprs={recentDprs.map((dpr) => ({
          id: dpr.id,
          workSummary: dpr.workSummary,
          progressPct: toNum(dpr.progressPct),
          date: dpr.date.toISOString(),
          project: { name: dpr.project.name },
          submittedBy: dpr.submittedBy ? { name: dpr.submittedBy.name } : null,
          approvalStatus: dpr.approvalStatus}))}
        tradeBreakdown={tradeBreakdown}
        attendanceTrend={attendanceTrend}
        projectPresence={projectPresence}
        monthlyLabourCost={canSeePayroll ? monthlyLabourCost : null}
      />

      {/* ── Organization tree — reporting line + scope assignments ── */}
      <OrgHierarchyDesktop tree={orgTree} />

      {/* ── Exits & settlements — terminated staff otherwise vanish; a
          PENDING full-and-final is a payable nobody can see or pay. ── */}
      {canSeePayroll && <ExitsPanel companyId={company.id} canManage={__effPerms.includes(PERM.HR_MANAGE)} />}
    </div>
  );
}

async function ExitsPanel({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const exits = await prisma.employeeExit.findMany({
    where: { companyId },
    orderBy: { terminationDate: "desc" },
    take: 50,
  });
  if (exits.length === 0) return null;
  // EmployeeExit stores employeeId as a plain FK string (soft-deleted rows
  // can't hold a live relation) — resolve names separately.
  const employees = await prisma.employee.findMany({
    where: { id: { in: exits.map((x) => x.employeeId) } },
    select: { id: true, name: true },
  });
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <h3 className="text-body font-semibold text-foreground">Exits &amp; Full-and-Final Settlements</h3>
      <div className="mt-3 divide-y divide-border">
        {exits.map((x) => (
          <div key={x.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-body font-medium text-foreground">
                {employeeById.get(x.employeeId)?.name ?? "Former employee"}
              </p>
              <p className="text-caption text-muted-foreground">
                Exited {formatDate(x.terminationDate)}
                {x.terminationReason ? ` · ${x.terminationReason}` : ""}
                {(x.pfExitFiled === false || x.esiExitFiled === false) && <span className="ml-1.5 text-warning">statutory filing pending</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {x.finalSettlementAmount != null ? (
                <span className="tnum text-body">{formatCurrency(toNum(x.finalSettlementAmount))}</span>
              ) : (
                <span className="text-caption text-muted-foreground">Amount TBD</span>
              )}
              {x.finalSettlementStatus === "COMPLETED" ? (
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-micro font-medium text-emerald-700">Settled</span>
              ) : canManage ? (
                <SettleExitButton employeeId={x.employeeId} suggestedAmount={x.finalSettlementAmount ? toNum(x.finalSettlementAmount) : null} />
              ) : (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-micro font-medium text-amber-700">Pending</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ORG TREE LOADER — builds the people hierarchy for the OrgHierarchy tree.
   (Shared logic — mirrors the mobile /m/hr loader.)
   ═══════════════════════════════════════════════════════════════════════════ */
async function loadOrgTree(
  companyId: string,
  companyName: string,
  currentUserId: string | null,
  canSeePayroll = true,
): Promise<OrgTreeData> {
  const today = new Date();
  const todayDateOnly = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const memberships = await prisma.userCompany.findMany({
    where: { companyId, user: { isHidden: { not: true } } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          active: true,
          designation: true,
          department: true,
          employeeCode: true}},
      scopes: {
        include: {
          department: { select: { name: true } },
          project: { select: { name: true } }}}},
    orderBy: { user: { name: "asc" } }});

  // ── Fetch hierarchy levels + employee IDs + on-site reporting lines from Employee records ──
  const userIds = memberships.map((m) => m.userId);
  const employees = await prisma.employee.findMany({
    where: { companyId, userId: { in: userIds }, deletedAt: null },
    select: { id: true, userId: true, hierarchyLevel: true, reportsToEmployeeId: true }});
  const employeeByUserId = new Map(employees.map((e) => [e.userId, e]));

  if (memberships.length === 0) {
    return {
      companyName,
      peopleCount: 0,
      projectCount: 0,
      roots: [],
      unassigned: [],
      projects: [],
      departments: [],
      labourByTrade: [],
      labourCount: 0};
  }

  const [tasks, allTasks, dprs, crews, unassignedEmployees, todayAttendanceRows, leaveRows] = await Promise.all([
    prisma.task.findMany({
      where: {...await scopeWhere("Task"),  assignedToId: { in: userIds }, status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      orderBy: { createdAt: "desc" }}),
    prisma.task.findMany({
      where: {...await scopeWhere("Task"),  assignedToId: { in: userIds } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      orderBy: { createdAt: "desc" },
      take: 500}),
    prisma.dailyProgressReport.findMany({
      where: {...await scopeWhere("DailyProgressReport"),  submittedById: { in: userIds } },
      orderBy: { date: "desc" },
      take: userIds.length * 5,
      select: { id: true, date: true, approvalStatus: true, submittedById: true, project: { select: { name: true } } }}),
    prisma.crew.findMany({
      where: {...await scopeWhere("Crew"),  companyId, active: true },
      include: {
        supervisor: { select: { userId: true } },
        project: { select: { name: true } },
        members: {
          where: { deletedAt: null, active: true },
          select: {
            id: true, name: true, trade: true, designation: true, wageType: true,
            dailyRate: true, monthlySalary: true, active: true, crewId: true,
            phone: true, activeProject: { select: { name: true } }}}}}),
    prisma.employee.findMany({
      where: { companyId, deletedAt: null, crewId: null, userId: { notIn: userIds } },
      select: {
        id: true, name: true, trade: true, designation: true, wageType: true,
        dailyRate: true, monthlySalary: true, active: true, crewId: true,
        phone: true, activeProject: { select: { name: true } }}}),
    prisma.workerAttendance.findMany({
      where: {...await scopeWhere("WorkerAttendance"), 
        company: { id: companyId },
        date: todayDateOnly,
        employee: { userId: { in: userIds } }},
      select: {
        employeeId: true, status: true, checkIn: true, checkOut: true,
        employee: { select: { userId: true } },
        project: { select: { name: true } }}}).catch(() => []),
    prisma.leaveRequest.findMany({
      where: {...await scopeWhere("LeaveRequest"), 
        company: { id: companyId },
        employee: { userId: { in: userIds } },
        status: { in: ["PENDING", "APPROVED"] }},
      select: {
        id: true, employeeId: true, status: true, startDate: true, endDate: true,
        employee: { select: { userId: true } }}}).catch(() => []),
  ]);

  // Fetch custom roles so the tree builder can resolve them
  const customRoles = await prisma.customRole.findMany({
    where: { companyId },
    select: { key: true, label: true, baseRole: true, tier: true, hierarchyLevel: true }}).catch(() => []);
  const customRoleMap = new Map(customRoles.map((r) => [r.key, r]));

  const roleTierFn = (role: string): number => {
    if (role.startsWith("CUSTOM_")) {
      const cr = customRoleMap.get(role);
      if (cr) return cr.tier;
    }
    const r = migrateRole(role) ?? "SUPERVISOR";
    return ROLES[r]?.tier ?? 5;
  };
  const roleLabelFn = (role: string): string => {
    if (role.startsWith("CUSTOM_")) {
      const cr = customRoleMap.get(role);
      if (cr) return cr.label;
    }
    const r = migrateRole(role) ?? "SUPERVISOR";
    return ROLES[r]?.label ?? r;
  };

  // ── Inject hierarchyLevel + employeeId + reportsToEmployeeId into memberships ──
  // For custom roles, use the custom role's hierarchyLevel if set (overrides
  // Employee.hierarchyLevel so the org tree depth reflects the role's position).
  const membershipsWithHierarchy = memberships.map((m) => {
    const emp = employeeByUserId.get(m.userId);
    const customRole = m.role.startsWith("CUSTOM_") ? customRoleMap.get(m.role) : undefined;
    return {
      ...m,
      hierarchyLevel: customRole?.hierarchyLevel ?? emp?.hierarchyLevel ?? null,
      employeeId: emp?.id ?? null,
      reportsToEmployeeId: emp?.reportsToEmployeeId ?? null};
  });

  // Strip wage amounts from member payloads before they reach the client
  // tree — roster viewers get names/trades/crews without rates.
  const crewsForTree = canSeePayroll
    ? crews
    : crews.map((c) => ({ ...c, members: c.members.map((m) => ({ ...m, dailyRate: null, monthlySalary: null })) }));
  const unassignedForTree = canSeePayroll
    ? unassignedEmployees
    : unassignedEmployees.map((e) => ({ ...e, dailyRate: null, monthlySalary: null }));

  const { roots, unassigned, projects, departments, labourByTrade, labourCount } = buildOrgTree(
    membershipsWithHierarchy as unknown as Parameters<typeof buildOrgTree>[0],
    tasks as unknown as Parameters<typeof buildOrgTree>[1],
    dprs as unknown as Parameters<typeof buildOrgTree>[2],
    crewsForTree as unknown as Parameters<typeof buildOrgTree>[3],
    unassignedForTree as unknown as Parameters<typeof buildOrgTree>[4],
    currentUserId,
    roleTierFn,
    roleLabelFn,
    allTasks as unknown as Parameters<typeof buildOrgTree>[8],
    todayAttendanceRows as unknown as Parameters<typeof buildOrgTree>[9],
    leaveRows as unknown as Parameters<typeof buildOrgTree>[10],
    customRoles,
  );

  return {
    companyName,
    peopleCount: memberships.length,
    projectCount: projects.length,
    roots,
    unassigned,
    projects,
    departments,
    labourByTrade,
    labourCount};
}

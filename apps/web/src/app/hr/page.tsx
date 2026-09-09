import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, toNum, getUserRole, scopeWhere } from "@/lib/server";
import { PERM, hasPermission, migrateRole, ROLES } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/page-header";
import { HrDashboard } from "@/components/hr/hr-dashboard";
import { OrgHierarchyDesktop } from "@/components/hr/org-hierarchy";
import type { OrgTreeData } from "@/app/m/hr/OrgHierarchy";
import { buildOrgTree } from "@/lib/org-tree-builder";
import { NoAccess } from "@/components/no-access";

export default function HrDashboardPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading HR dashboard…" variant="list" />}>
      <HrDashboardContent />
    </Suspense>
  );
}

async function HrDashboardContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const currentUser = await getCurrentUser();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return <NoAccess what="the HR module" />;
  }

  const today = new Date();
  const todayDateOnly = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

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
    employees,
    weekAttendance,
    todayProjectAttendance,
    orgTree,
  ] = await Promise.all([
    prisma.employee.count({ where: { companyId: company.id, deletedAt: null } }),
    prisma.employee.count({ where: { companyId: company.id, deletedAt: null, active: true } }),
    prisma.crew.count({ where: { companyId: company.id, active: true } }),
    prisma.workerAttendance.count({ where: { companyId: company.id, date: todayDateOnly } }),
    prisma.workerAttendance.count({ where: { companyId: company.id, date: todayDateOnly, status: { in: ["PRESENT", "OVERTIME"] } } }),
    prisma.workerAttendance.count({ where: { companyId: company.id, date: todayDateOnly, status: "ABSENT" } }),
    prisma.payrollPeriod.findFirst({
      where: { companyId: company.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { _count: { select: { lines: true } } },
    }),
    prisma.dailyProgressReport.findMany({
      where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, date: { gte: weekAgo } },
      orderBy: { date: "desc" },
      take: 8,
      include: { project: { select: { name: true } }, submittedBy: { select: { name: true } } },
    }),
    prisma.payrollPeriod.count({ where: { companyId: company.id, status: "DRAFT" } }),
    prisma.dailyProgressReport.count({ where: { companyId: company.id, approvalStatus: "SUBMITTED" } }),
    prisma.leaveRequest.count({ where: { companyId: company.id, status: "PENDING" } }),
    prisma.employee.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null, active: true },
      select: { trade: true, dailyRate: true, wageType: true, monthlySalary: true },
    }),
    prisma.workerAttendance.findMany({
      take: 200,
      where: {...await scopeWhere("WorkerAttendance"),  companyId: company.id, date: { gte: weekAgo } },
      select: { date: true, status: true },
    }),
    prisma.workerAttendance.findMany({
      take: 500,
      where: {...await scopeWhere("WorkerAttendance"),  companyId: company.id, date: todayDateOnly, status: { in: ["PRESENT", "OVERTIME"] } },
      include: { project: { select: { name: true } } },
    }),
    loadOrgTree(company.id, company.name, currentUser?.id ?? null),
  ]);

  // Compute trade breakdown
  const tradeMap = new Map<string, number>();
  for (const e of employees) {
    const trade = e.trade || "Unspecified";
    tradeMap.set(trade, (tradeMap.get(trade) ?? 0) + 1);
  }
  const tradeBreakdown = Array.from(tradeMap.entries()).map(([trade, count]) => ({ trade, count }));

  // Compute monthly labour cost (estimated from active employee daily rates + monthly salaries)
  let monthlyLabourCost = 0;
  for (const e of employees) {
    if (e.wageType === "DAILY") {
      monthlyLabourCost += toNum(e.dailyRate) * 26; // ~26 working days
    } else {
      monthlyLabourCost += toNum(e.monthlySalary);
    }
  }
  // If we have a latest payroll from the current month/year, use its net instead.
  // Older payrolls don't represent the current month's cost.
  if (latestPayroll && latestPayroll.month === today.getMonth() + 1 && latestPayroll.year === today.getFullYear()) {
    monthlyLabourCost = toNum(latestPayroll.totalNet);
  }

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
    overtime: v.overtime,
  }));

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
    <div className="space-y-4">
      <PageHeader
        title="HR Dashboard"
        description="Daily workforce overview — attendance, pending approvals, and payroll status."
        stats={[
          { label: "Employees", value: employeeCount, hint: "Total employees on record, including inactive ones (soft-deleted excluded)." },
          { label: "Present today", value: presentToday, hint: "Workers marked PRESENT or OVERTIME in today's attendance." },
          { label: "Crews", value: crewCount, hint: "Active worker crews currently registered." },
        ]}
      />
      <div className="flex justify-end">
        <RefreshButton />
      </div>

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
        latestPayroll={latestPayroll ? {
          month: latestPayroll.month,
          year: latestPayroll.year,
          status: latestPayroll.status,
          totalGross: toNum(latestPayroll.totalGross),
          totalDeductions: toNum(latestPayroll.totalDeductions),
          totalNet: toNum(latestPayroll.totalNet),
          employeeCount: latestPayroll._count.lines,
        } : null}
        recentDprs={recentDprs.map((dpr) => ({
          id: dpr.id,
          workSummary: dpr.workSummary,
          progressPct: toNum(dpr.progressPct),
          date: dpr.date.toISOString(),
          project: { name: dpr.project.name },
          submittedBy: dpr.submittedBy ? { name: dpr.submittedBy.name } : null,
          approvalStatus: dpr.approvalStatus,
        }))}
        tradeBreakdown={tradeBreakdown}
        attendanceTrend={attendanceTrend}
        projectPresence={projectPresence}
        monthlyLabourCost={monthlyLabourCost}
      />

      {/* ── Organization tree — reporting line + scope assignments ── */}
      <OrgHierarchyDesktop tree={orgTree} />
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
          employeeCode: true,
        },
      },
      scopes: {
        include: {
          department: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  // ── Fetch hierarchy levels from Employee records (linked via userId) ──
  const userIds = memberships.map((m) => m.userId);
  const employees = await prisma.employee.findMany({
    where: { companyId, userId: { in: userIds }, deletedAt: null },
    select: { userId: true, hierarchyLevel: true },
  });
  const hierarchyByUserId = new Map(employees.map((e) => [e.userId, e.hierarchyLevel]));

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
      labourCount: 0,
    };
  }

  const [tasks, allTasks, dprs, crews, unassignedEmployees, todayAttendanceRows, leaveRows] = await Promise.all([
    prisma.task.findMany({
      where: {...await scopeWhere("Task"),  assignedToId: { in: userIds }, status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: {...await scopeWhere("Task"),  assignedToId: { in: userIds } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.dailyProgressReport.findMany({
      where: {...await scopeWhere("DailyProgressReport"),  submittedById: { in: userIds } },
      orderBy: { date: "desc" },
      take: userIds.length * 5,
      select: { id: true, date: true, approvalStatus: true, submittedById: true, project: { select: { name: true } } },
    }),
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
            phone: true, activeProject: { select: { name: true } },
          },
        },
      },
    }),
    prisma.employee.findMany({
      where: { companyId, deletedAt: null, crewId: null, userId: { notIn: userIds } },
      select: {
        id: true, name: true, trade: true, designation: true, wageType: true,
        dailyRate: true, monthlySalary: true, active: true, crewId: true,
        phone: true, activeProject: { select: { name: true } },
      },
    }),
    prisma.workerAttendance.findMany({
      where: {...await scopeWhere("WorkerAttendance"), 
        company: { id: companyId },
        date: todayDateOnly,
        employee: { userId: { in: userIds } },
      },
      select: {
        employeeId: true, status: true, checkIn: true, checkOut: true,
        employee: { select: { userId: true } },
        project: { select: { name: true } },
      },
    }).catch(() => []),
    prisma.leaveRequest.findMany({
      where: {...await scopeWhere("LeaveRequest"), 
        company: { id: companyId },
        employee: { userId: { in: userIds } },
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        id: true, employeeId: true, status: true, startDate: true, endDate: true,
        employee: { select: { userId: true } },
      },
    }).catch(() => []),
  ]);

  const roleTierFn = (role: string): number => {
    const r = migrateRole(role) ?? "SUPERVISOR";
    return ROLES[r]?.tier ?? 5;
  };
  const roleLabelFn = (role: string): string => {
    const r = migrateRole(role) ?? "SUPERVISOR";
    return ROLES[r]?.label ?? r;
  };

  // ── Inject hierarchyLevel into memberships (from Employee records) ──
  const membershipsWithHierarchy = memberships.map((m) => ({
    ...m,
    hierarchyLevel: hierarchyByUserId.get(m.userId) ?? null,
  }));

  const { roots, unassigned, projects, departments, labourByTrade, labourCount } = buildOrgTree(
    membershipsWithHierarchy as unknown as Parameters<typeof buildOrgTree>[0],
    tasks as unknown as Parameters<typeof buildOrgTree>[1],
    dprs as unknown as Parameters<typeof buildOrgTree>[2],
    crews as unknown as Parameters<typeof buildOrgTree>[3],
    unassignedEmployees as unknown as Parameters<typeof buildOrgTree>[4],
    currentUserId,
    roleTierFn,
    roleLabelFn,
    allTasks as unknown as Parameters<typeof buildOrgTree>[8],
    todayAttendanceRows as unknown as Parameters<typeof buildOrgTree>[9],
    leaveRows as unknown as Parameters<typeof buildOrgTree>[10],
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
    labourCount,
  };
}

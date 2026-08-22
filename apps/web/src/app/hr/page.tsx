import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/page-header";
import { HrDashboard } from "@/components/hr/hr-dashboard";
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
      where: { companyId: company.id, date: { gte: weekAgo } },
      orderBy: { date: "desc" },
      take: 8,
      include: { project: { select: { name: true } }, submittedBy: { select: { name: true } } },
    }),
    prisma.payrollPeriod.count({ where: { companyId: company.id, status: "DRAFT" } }),
    prisma.dailyProgressReport.count({ where: { companyId: company.id, approvalStatus: "SUBMITTED" } }),
    prisma.leaveRequest.count({ where: { companyId: company.id, status: "PENDING" } }),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true },
      select: { trade: true, dailyRate: true, wageType: true, monthlySalary: true },
    }),
    prisma.workerAttendance.findMany({
      where: { companyId: company.id, date: { gte: weekAgo } },
      select: { date: true, status: true },
    }),
    prisma.workerAttendance.findMany({
      where: { companyId: company.id, date: todayDateOnly, status: { in: ["PRESENT", "OVERTIME"] } },
      include: { project: { select: { name: true } } },
    }),
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
  // If we have a latest payroll, use its net instead
  if (latestPayroll) {
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

  // Compute project presence today
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
          { label: "Employees", value: employeeCount },
          { label: "Present today", value: presentToday },
          { label: "Crews", value: crewCount },
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
    </div>
  );
}

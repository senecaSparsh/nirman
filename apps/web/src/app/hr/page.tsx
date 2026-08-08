import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@nirman/db";
import { Users, CalendarCheck, Wallet, ClipboardList, TrendingUp, ArrowRight } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { Page, MetricGrid, Metric, StatusPill } from "@/components/page";
import { RefreshButton } from "@/components/refresh-button";
import { HrDprList } from "@/components/hr/hr-dpr-list";

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
    return (
      <NoAccess what="the HR module" />
    );
  }

  const today = new Date();
  const todayDateOnly = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

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
    }),
    prisma.dailyProgressReport.findMany({
      where: { companyId: company.id, date: { gte: new Date(today.getTime() - 7 * 86400000) } },
      orderBy: { date: "desc" },
      take: 5,
      include: { project: { select: { name: true } }, submittedBy: { select: { name: true } } },
    }),
    prisma.payrollPeriod.count({ where: { companyId: company.id, status: "DRAFT" } }),
  ]);

  return (
    <Page>
      <div className="flex items-center justify-end">
        <RefreshButton />
      </div>

      {/* Stats — one instrument panel, not four competing cards */}
      <MetricGrid cols={4}>
        <Metric label="Employees" value={employeeCount} sub={`${activeEmployees} active`} href="/hr/employees" icon={<Users />} />
        <Metric label="Crews" value={crewCount} href="/hr/crews" icon={<Users />} />
        <Metric label="Present Today" value={presentToday} sub={`${absentToday} absent`} href="/hr/attendance" icon={<CalendarCheck />} />
        <Metric label="Draft Payrolls" value={pendingPayrolls} href="/hr/payroll" icon={<Wallet />} />
      </MetricGrid>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Recent DPRs */}
        <div>
          <HrDprList dprs={recentDprs.map((dpr) => ({
            id: dpr.id,
            workSummary: dpr.workSummary,
            progressPct: toNum(dpr.progressPct),
            date: dpr.date.toISOString(),
            project: { name: dpr.project.name },
            submittedBy: dpr.submittedBy ? { name: dpr.submittedBy.name } : null,
          }))} />
        </div>

        {/* Payroll summary */}
        <div className="space-y-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-label text-muted-foreground">Latest Payroll</h2>
            </div>
            {latestPayroll ? (
              <Link
                href="/hr/payroll"
                className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
              >
                <div className="flex items-center justify-between">
                  <span className="text-body font-medium">
                    {latestPayroll.month}/{latestPayroll.year}
                  </span>
                  <StatusPill status={latestPayroll.status} />
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-caption">
                    <span className="text-muted-foreground">Gross</span>
                    <span className="tnum font-medium">{formatCurrency(toNum(latestPayroll.totalGross))}</span>
                  </div>
                  <div className="flex justify-between text-caption">
                    <span className="text-muted-foreground">Deductions</span>
                    <span className="tnum font-medium">{formatCurrency(toNum(latestPayroll.totalDeductions))}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 text-body">
                    <span className="font-medium">Net</span>
                    <span className="tnum font-bold">{formatCurrency(toNum(latestPayroll.totalNet))}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-caption text-primary group-hover:underline">
                  View details <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4 text-body text-muted-foreground">
                No payroll generated yet.{" "}
                <Link href="/hr/payroll" className="text-primary hover:underline">Generate one →</Link>
              </div>
            )}
          </div>

          {/* Today's attendance summary */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-label text-muted-foreground">Today&apos;s Attendance</h2>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="tnum text-body font-bold text-success">{presentToday}</div>
                  <div className="text-micro text-muted-foreground">Present</div>
                </div>
                <div>
                  <div className="tnum text-body font-bold text-danger">{absentToday}</div>
                  <div className="text-micro text-muted-foreground">Absent</div>
                </div>
                <div>
                  <div className="tnum text-body font-bold text-muted-foreground">{todayAttendance}</div>
                  <div className="text-micro text-muted-foreground">Total</div>
                </div>
              </div>
              <Link
                href="/hr/attendance"
                className="mt-3 flex items-center justify-center gap-1 text-caption text-primary hover:underline"
              >
                Log attendance <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

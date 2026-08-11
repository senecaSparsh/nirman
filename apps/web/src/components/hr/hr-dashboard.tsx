"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowRight, TrendingUp, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatNumber, formatDate, formatCurrency, cn } from "@/lib/utils";


type DprItem = {
  id: string;
  workSummary: string;
  progressPct: number;
  date: string;
  project: { name: string };
  submittedBy: { name: string } | null;
  approvalStatus: string;
};

type TradeBreakdown = { trade: string; count: number };

type AttendanceDay = {
  date: string;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  overtime: number;
};

type ProjectPresence = {
  projectName: string;
  present: number;
  total: number;
};

type PendingAction = {
  label: string;
  count: number;
  href: string;
  tone: "warning" | "danger" | "info";
};

type PayrollSummary = {
  month: number;
  year: number;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
} | null;

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Attendance rate ring — a circular gauge showing present percentage. */
function AttendanceRing({ rate, present, absent, total }: { rate: number; present: number; absent: number; total: number }) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (rate / 100) * circumference;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="var(--color-muted)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r="36" fill="none"
            stroke="var(--color-success)" strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-figure-lg text-foreground">{rate.toFixed(0)}<span className="text-body">%</span></span>
          <span className="text-micro text-muted-foreground">present</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-caption">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-muted-foreground">Present</span>
          <span className="tnum font-semibold text-foreground">{present}</span>
        </div>
        <div className="flex items-center gap-2 text-caption">
          <span className="h-2 w-2 rounded-full bg-danger" />
          <span className="text-muted-foreground">Absent</span>
          <span className="tnum font-semibold text-foreground">{absent}</span>
        </div>
        <div className="flex items-center gap-2 text-caption">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          <span className="text-muted-foreground">Total logged</span>
          <span className="tnum font-semibold text-foreground">{total}</span>
        </div>
      </div>
    </div>
  );
}

/** 7-day attendance trend — a simple bar chart. */
function AttendanceTrend({ days }: { days: AttendanceDay[] }) {
  const maxVal = Math.max(...days.map((d) => d.present + d.absent + d.leave + d.halfDay), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
      {days.map((d, i) => {
        const total = d.present + d.absent + d.leave + d.halfDay;
        const presentH = total > 0 ? (d.present / maxVal) * 100 : 0;
        const absentH = total > 0 ? (d.absent / maxVal) * 100 : 0;
        const otherH = total > 0 ? ((d.leave + d.halfDay) / maxVal) * 100 : 0;
        const dayLabel = new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" });
        return (
          <div key={i} className="group flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-col justify-end" style={{ height: 60 }}>
              <div className="w-full rounded-t-sm bg-warning/40" style={{ height: `${otherH}%` }} title={`Leave/Half: ${d.leave + d.halfDay}`} />
              <div className="w-full bg-danger/40" style={{ height: `${absentH}%` }} title={`Absent: ${d.absent}`} />
              <div className="w-full rounded-b-sm bg-success/60" style={{ height: `${presentH}%` }} title={`Present: ${d.present}`} />
            </div>
            <span className="text-micro text-muted-foreground">{dayLabel[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bar list for trade breakdown. */
function TradeBreakdownChart({ trades, total }: { trades: TradeBreakdown[]; total: number }) {
  const sorted = [...trades].sort((a, b) => b.count - a.count).slice(0, 8);
  const maxCount = Math.max(...sorted.map((t) => t.count), 1);
  return (
    <div className="space-y-2">
      {sorted.map((t) => {
        const pct = (t.count / maxCount) * 100;
        const sharePct = total > 0 ? (t.count / total) * 100 : 0;
        return (
          <div key={t.trade} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-caption text-muted-foreground">{t.trade}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
              <div
                className="h-full rounded-sm bg-[var(--color-world-hr)]/60"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tnum w-8 text-right text-caption font-medium text-foreground">{t.count}</span>
            <span className="tnum w-10 text-right text-micro text-muted-foreground">{sharePct.toFixed(0)}%</span>
          </div>
        );
      })}
      {trades.length === 0 && (
        <p className="py-4 text-center text-caption text-muted-foreground">No trade data yet</p>
      )}
    </div>
  );
}

/** Project presence — where workers are today. */
function ProjectPresenceList({ projects }: { projects: ProjectPresence[] }) {
  if (projects.length === 0) {
    return <p className="py-4 text-center text-caption text-muted-foreground">No site attendance logged today</p>;
  }
  return (
    <div className="space-y-2">
      {projects.map((p) => {
        const rate = p.total > 0 ? (p.present / p.total) * 100 : 0;
        return (
          <div key={p.projectName} className="flex items-center gap-2">
            <span className="flex-1 truncate text-caption font-medium text-foreground">{p.projectName}</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", rate >= 75 ? "bg-success" : rate >= 50 ? "bg-warning" : "bg-danger")} style={{ width: `${rate}%` }} />
            </div>
            <span className="tnum w-16 text-right text-caption text-muted-foreground">{p.present}/{p.total}</span>
          </div>
        );
      })}
    </div>
  );
}

export function HrDashboard({
  employeeCount,
  activeEmployees,
  crewCount,
  presentToday,
  absentToday,
  totalAttendanceToday,
  attendanceRate,
  pendingPayrolls,
  pendingDprApprovals,
  pendingLeaves,
  latestPayroll,
  recentDprs,
  tradeBreakdown,
  attendanceTrend,
  projectPresence,
  monthlyLabourCost,
}: {
  employeeCount: number;
  activeEmployees: number;
  crewCount: number;
  presentToday: number;
  absentToday: number;
  totalAttendanceToday: number;
  attendanceRate: number;
  pendingPayrolls: number;
  pendingDprApprovals: number;
  pendingLeaves: number;
  latestPayroll: PayrollSummary;
  recentDprs: DprItem[];
  tradeBreakdown: TradeBreakdown[];
  attendanceTrend: AttendanceDay[];
  projectPresence: ProjectPresence[];
  monthlyLabourCost: number;
}) {
  const [query, setQuery] = useState("");

  const filteredDprs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentDprs;
    return recentDprs.filter((d) =>
      d.project.name.toLowerCase().includes(q) ||
      d.workSummary.toLowerCase().includes(q) ||
      (d.submittedBy?.name ?? "").toLowerCase().includes(q),
    );
  }, [recentDprs, query]);

  const pendingActions: PendingAction[] = [
    ...(pendingDprApprovals > 0 ? [{ label: "DPRs pending approval", count: pendingDprApprovals, href: "/hr/dprs", tone: "warning" as const }] : []),
    ...(pendingLeaves > 0 ? [{ label: "Leave requests pending", count: pendingLeaves, href: "/hr/attendance", tone: "info" as const }] : []),
    ...(pendingPayrolls > 0 ? [{ label: "Draft payrolls to process", count: pendingPayrolls, href: "/hr/payroll", tone: "danger" as const }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* ── Row 1: KPI band ─────────────────────────────────────────── */}
      <div className="grid divide-border overflow-hidden rounded-lg border border-border bg-card sm:divide-x sm:grid-cols-4 divide-y sm:divide-y-0">
        <Link href="/hr/employees" className="group flex flex-col gap-1 p-4 transition-colors hover:bg-subtle">
          <span className="text-label text-muted-foreground/75">Headcount</span>
          <span className="text-figure-lg text-foreground">{employeeCount}</span>
          <span className="text-caption text-muted-foreground">{activeEmployees} active · {crewCount} crews</span>
        </Link>
        <Link href="/hr/attendance" className="group flex flex-col gap-1 p-4 transition-colors hover:bg-subtle">
          <span className="text-label text-muted-foreground/75">Present Today</span>
          <span className="text-figure-lg text-success">{presentToday}</span>
          <span className="text-caption text-muted-foreground">{absentToday} absent · {totalAttendanceToday - presentToday - absentToday} other</span>
        </Link>
        <Link href="/hr/payroll" className="group flex flex-col gap-1 p-4 transition-colors hover:bg-subtle">
          <span className="text-label text-muted-foreground/75">Monthly Labour Cost</span>
          <span className="text-figure-lg text-foreground">{formatCurrency(monthlyLabourCost)}</span>
          <span className="text-caption text-muted-foreground">{pendingPayrolls > 0 ? `${pendingPayrolls} draft payroll${pendingPayrolls > 1 ? "s" : ""}` : "All payrolls settled"}</span>
        </Link>
        <Link href="/hr/dprs" className="group flex flex-col gap-1 p-4 transition-colors hover:bg-subtle">
          <span className="text-label text-muted-foreground/75">Pending Approvals</span>
          <span className={cn("text-figure-lg", pendingActions.length > 0 ? "text-warning" : "text-foreground")}>
            {pendingDprApprovals + pendingLeaves}
          </span>
          <span className="text-caption text-muted-foreground">{pendingDprApprovals} DPRs · {pendingLeaves} leaves</span>
        </Link>
      </div>

      {/* ── Row 2: Attendance + Trade breakdown ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Attendance panel */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-section text-foreground">Today&apos;s Attendance</h2>
            <Link href="/hr/attendance" className="flex items-center gap-0.5 text-caption text-brand hover:underline">
              Log attendance <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
            <AttendanceRing rate={attendanceRate} present={presentToday} absent={absentToday} total={totalAttendanceToday} />
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-label text-muted-foreground/75">7-day trend</span>
              </div>
              <AttendanceTrend days={attendanceTrend} />
            </div>
          </div>
        </div>

        {/* Trade breakdown panel */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-section text-foreground">Headcount by Trade</h2>
            <Link href="/hr/employees" className="flex items-center gap-0.5 text-caption text-brand hover:underline">
              All employees <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-4">
            <TradeBreakdownChart trades={tradeBreakdown} total={employeeCount} />
          </div>
        </div>
      </div>

      {/* ── Row 3: Pending actions + Project presence ───────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Pending actions */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-section text-foreground">Action Queue</h2>
          </div>
          <div className="p-4">
            {pendingActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
                  <span className="text-success text-body">✓</span>
                </div>
                <p className="text-body text-muted-foreground">All caught up — nothing pending</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingActions.map((a, i) => (
                  <Link
                    key={i}
                    href={a.href}
                    className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-subtle"
                  >
                    <span className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md",
                      a.tone === "warning" && "bg-warning/10 text-warning",
                      a.tone === "danger" && "bg-danger/10 text-danger",
                      a.tone === "info" && "bg-info/10 text-info",
                    )}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-body font-medium text-foreground">{a.label}</span>
                    <span className="tnum text-figure text-foreground">{a.count}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Project presence */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-section text-foreground">Site Presence Today</h2>
          </div>
          <div className="p-4">
            <ProjectPresenceList projects={projectPresence} />
          </div>
        </div>
      </div>

      {/* ── Row 4: Recent DPRs + Payroll summary ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Recent DPRs */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <h2 className="text-section text-foreground">Recent Daily Progress Reports</h2>
            <div className="relative ml-auto sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-caption" />
            </div>
          </div>
          <div className="p-2">
            {filteredDprs.length === 0 ? (
              <p className="py-8 text-center text-body text-muted-foreground">
                {recentDprs.length === 0 ? (
                  <>No DPRs this week. <Link href="/hr/dprs" className="text-brand hover:underline">Create one →</Link></>
                ) : (
                  "No DPRs match the search."
                )}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filteredDprs.map((dpr) => (
                  <Link
                    key={dpr.id}
                    href={`/hr/dprs?id=${dpr.id}`}
                    className="group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-subtle rounded-md"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-body font-medium text-foreground">{dpr.project.name}</span>
                        <span className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-micro font-medium",
                          dpr.approvalStatus === "APPROVED" && "bg-success/10 text-success",
                          dpr.approvalStatus === "SUBMITTED" && "bg-warning/10 text-warning",
                          dpr.approvalStatus === "SUB_ADMIN_APPROVED" && "bg-info/10 text-info",
                          dpr.approvalStatus === "REJECTED" && "bg-danger/10 text-danger",
                        )}>
                          {dpr.approvalStatus === "SUBMITTED" ? "Pending" : dpr.approvalStatus === "SUB_ADMIN_APPROVED" ? "Sub-Approved" : dpr.approvalStatus === "APPROVED" ? "Approved" : "Rejected"}
                        </span>
                      </div>
                      <div className="truncate text-caption text-muted-foreground">
                        {dpr.workSummary.slice(0, 80)}{dpr.workSummary.length > 80 ? "…" : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-caption font-medium text-foreground">{formatNumber(dpr.progressPct, 1)}%</div>
                      <div className="text-micro text-muted-foreground">{formatDate(dpr.date)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payroll summary */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-section text-foreground">Latest Payroll</h2>
          </div>
          <div className="p-4">
            {latestPayroll ? (
              <Link href="/hr/payroll" className="group block">
                <div className="flex items-center justify-between">
                  <span className="text-body font-medium">{MONTHS[latestPayroll.month]} {latestPayroll.year}</span>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-micro font-medium",
                    latestPayroll.status === "PAID" && "bg-success/10 text-success",
                    latestPayroll.status === "PROCESSED" && "bg-info/10 text-info",
                    latestPayroll.status === "DRAFT" && "bg-warning/10 text-warning",
                  )}>
                    {latestPayroll.status}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-caption">
                    <span className="text-muted-foreground">Gross</span>
                    <span className="tnum font-medium">{formatCurrency(latestPayroll.totalGross)}</span>
                  </div>
                  <div className="flex justify-between text-caption">
                    <span className="text-muted-foreground">Deductions</span>
                    <span className="tnum font-medium">{formatCurrency(latestPayroll.totalDeductions)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 text-body">
                    <span className="font-medium">Net Pay</span>
                    <span className="tnum font-bold">{formatCurrency(latestPayroll.totalNet)}</span>
                  </div>
                  <div className="text-micro text-muted-foreground">{latestPayroll.employeeCount} employees</div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-caption text-brand group-hover:underline">
                  View details <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ) : (
              <div className="py-6 text-center">
                <p className="text-body text-muted-foreground">No payroll generated yet.</p>
                <Link href="/hr/payroll" className="mt-2 inline-block text-caption text-brand hover:underline">Generate one →</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

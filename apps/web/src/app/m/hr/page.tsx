import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  ClipboardList,
  FileText,
  Wallet,
  CalendarDays,
  ArrowRight,
  Circle,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { computeAttendanceTier } from "@nirman/services";
import { getCompany, toNum } from "@/lib/server";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  SectionHead,
  Badge,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { HrInteractive } from "./hr-interactive";
import {
  WorkforceBreakdown,
  type TradeNode,
  type SitePresenceNode,
} from "./WorkforceBreakdown";

/**
 * HR module home — the second tab.
 *
 * Visual architecture (mirrors the inventory home):
 *   1. Attention banner carousel — pending approvals, draft payroll, absent workers
 *   2. KPI strip — workforce / present / pending / on-leave
 *   3. Field / People toggle + quick actions grid
 *   4. Workforce breakdown — headcount by trade + site presence today
 *   5. Pending approvals queue — DPRs, leaves, payroll (compact rows)
 *   6. Recent DPRs — latest daily progress reports
 *
 * Covers: attendance (half/full/late), DPR (daily progress reports:
 * labor, work, attendance time), employees, payroll, leaves, tasks.
 */
export default function HrHomePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <HrContent />
    </Suspense>
  );
}

async function HrContent() {
  await connection();
  const company = await getCompany();

  const today = new Date();
  const todayDateOnly = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const [
    recentDprs,
    employees,
    employeesWithTrade,
    todayAttendance,
    presentToday,
    absentToday,
    pendingDprCount,
    pendingLeaveCount,
    draftPayroll,
    _crewCount,
    todayProjectAttendance,
  ] = await Promise.all([
    prisma.dailyProgressReport
      .findMany({
        where: { project: { companyId: company.id } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { project: { select: { name: true } } },
      })
      .catch(() => []),
    prisma.employee
      .count({
        where: { companyId: company.id, active: true, deletedAt: null },
      })
      .catch(() => 0),
    prisma.employee
      .findMany({
        where: { companyId: company.id, active: true, deletedAt: null },
        select: { trade: true },
      })
      .catch(() => []),
    prisma.workerAttendance
      .count({
        where: {
          company: { id: company.id },
          date: todayDateOnly,
        },
      })
      .catch(() => 0),
    prisma.workerAttendance
      .count({
        where: {
          company: { id: company.id },
          date: todayDateOnly,
          status: { in: ["PRESENT", "OVERTIME"] },
        },
      })
      .catch(() => 0),
    prisma.workerAttendance
      .count({
        where: {
          company: { id: company.id },
          date: todayDateOnly,
          status: "ABSENT",
        },
      })
      .catch(() => 0),
    prisma.dailyProgressReport
      .count({
        where: {
          project: { companyId: company.id },
          approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] },
        },
      })
      .catch(() => 0),
    prisma.leaveRequest
      .count({
        where: { companyId: company.id, status: "PENDING" },
      })
      .catch(() => 0),
    prisma.payrollPeriod
      .findFirst({
        where: { companyId: company.id, status: "DRAFT" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true, month: true, year: true, totalNet: true },
      })
      .catch(() => null),
    prisma.crew
      .count({
        where: { companyId: company.id, active: true },
      })
      .catch(() => 0),
    prisma.workerAttendance
      .findMany({
        where: {
          company: { id: company.id },
          date: todayDateOnly,
          status: { in: ["PRESENT", "OVERTIME"] },
        },
        include: { project: { select: { name: true } } },
      })
      .catch(() => []),
  ]);

  // Fetch ALL today's attendance records (not just PRESENT/OVERTIME) for tier computation
  const allTodayAttendance = await prisma.workerAttendance
    .findMany({
      where: {
        company: { id: company.id },
        date: todayDateOnly,
      },
      select: {
        employeeId: true,
        projectId: true,
        status: true,
        checkInLat: true,
        checkInLng: true,
      },
    })
    .catch(() => []);

  // ── Compute trade breakdown ──
  const tradeMap = new Map<string, number>();
  for (const e of employeesWithTrade) {
    const trade = e.trade || "Unspecified";
    tradeMap.set(trade, (tradeMap.get(trade) ?? 0) + 1);
  }
  const tradeBreakdown: TradeNode[] = Array.from(tradeMap.entries()).map(
    ([trade, count]) => ({ trade, count }),
  );

  // ── Compute site presence today ──
  const projectMap = new Map<string, number>();
  for (const r of todayProjectAttendance) {
    const name = r.project?.name ?? "Unassigned";
    projectMap.set(name, (projectMap.get(name) ?? 0) + 1);
  }
  const sitePresence: SitePresenceNode[] = Array.from(projectMap.entries())
    .map(([projectName, present]) => ({
      projectName,
      present,
      total: presentToday > 0 ? presentToday : present,
    }))
    .sort((a, b) => b.present - a.present)
    .slice(0, 6);

  // ── Traffic-light attendance tiers (D10) ──────────────────────
  // RED = absent, YELLOW = present but DPR not approved, GREEN = present + DPR approved
  // Fetch DPR approval status for today's projects to compute tiers
  const todayProjectIds = new Set(
    allTodayAttendance
      .map((a) => a.projectId)
      .filter((id): id is string => id != null),
  );
  const dprApprovalMap = new Map<string, boolean>();
  if (todayProjectIds.size > 0) {
    const todayDprs = await prisma.dailyProgressReport.findMany({
      where: {
        project: { companyId: company.id },
        date: todayDateOnly,
      },
      select: { projectId: true, approvalStatus: true },
    });
    for (const dpr of todayDprs) {
      dprApprovalMap.set(dpr.projectId, dpr.approvalStatus === "APPROVED");
    }
  }

  // Compute tier for each attendance record today
  let redCount = 0, yellowCount = 0, greenCount = 0;
  for (const att of allTodayAttendance) {
    const dprApproved = att.projectId ? (dprApprovalMap.get(att.projectId) ?? false) : false;
    const hasGps = att.checkInLat != null && att.checkInLng != null;
    const tier = computeAttendanceTier({
      status: att.status,
      hasGpsCheckIn: hasGps,
      dprApproved,
    });
    if (tier === "RED") redCount++;
    else if (tier === "YELLOW") yellowCount++;
    else greenCount++;
  }
  const tierStats = { red: redCount, yellow: yellowCount, green: greenCount };

  // ── Build attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  // Pending DPR approvals
  if (pendingDprCount > 0) {
    attentionBanners.push({
      id: "dpr-approvals",
      title: `${pendingDprCount} Daily Progress Report${pendingDprCount !== 1 ? "s" : ""} pending approval`,
      subtitle: `Daily progress reports awaiting review`,
      href: "/m/dprs",
      severity: "low",
      qtyText: String(pendingDprCount),
      category: "DPR Approvals",
    });
  }

  // Draft payroll
  if (draftPayroll) {
    const monthName = new Date(2000, draftPayroll.month - 1, 1).toLocaleString(
      "en-IN",
      { month: "short" },
    );
    attentionBanners.push({
      id: "draft-payroll",
      title: `Payroll draft — ${monthName} ${draftPayroll.year}`,
      subtitle: draftPayroll.totalNet
        ? `Net payable: ${formatCurrency(toNum(draftPayroll.totalNet))}`
        : `Awaiting approval to process`,
      href: "/m/books/payroll",
      severity: "low",
      qtyText: "Draft",
      category: "Payroll",
    });
  }

  // Pending leave requests
  if (pendingLeaveCount > 0) {
    attentionBanners.push({
      id: "leave-approvals",
      title: `${pendingLeaveCount} leave request${pendingLeaveCount !== 1 ? "s" : ""} pending`,
      subtitle: `Leave applications awaiting approval`,
      href: "/m/hr/leaves",
      severity: "low",
      qtyText: String(pendingLeaveCount),
      category: "Leave Approvals",
    });
  }

  // Absent workers today
  if (absentToday > 0) {
    attentionBanners.push({
      id: "absent-today",
      title: `${absentToday} worker${absentToday !== 1 ? "s" : ""} absent today`,
      subtitle: `${presentToday} present · ${todayAttendance - presentToday - absentToday} other status`,
      href: "/m/attendance",
      severity: "out",
      qtyText: String(absentToday),
      category: "Attendance",
    });
  }

  // Individual pending DPRs (most recent first)
  for (const dpr of recentDprs.filter(
    (d) =>
      d.approvalStatus === "SUBMITTED" ||
      d.approvalStatus === "SUB_ADMIN_APPROVED",
  )) {
    attentionBanners.push({
      id: dpr.id,
      title: `DPR — ${dpr.project?.name ?? "—"}`,
      subtitle: `${formatDate(dpr.date)} · ${dpr.approvalStatus === "SUBMITTED" ? "Awaiting sub-admin" : "Awaiting admin"}`,
      href: `/m/dprs/${dpr.id}`,
      severity: "low",
      qtyText: dpr.approvalStatus === "SUBMITTED" ? "New" : "Sub",
      category: "Daily Progress Report",
    });
  }

  // If no alerts, show contextual banner
  if (attentionBanners.length === 0) {
    if (todayAttendance === 0 && employees > 0) {
      // Attendance hasn't been recorded yet — prompt the user
      attentionBanners.push({
        id: "attendance-pending",
        title: "Attendance not yet recorded",
        subtitle: `${employees} active employees · Take today's attendance to get started`,
        href: "/m/site/attendance",
        severity: "low",
        qtyText: "!",
        category: "Attendance Pending",
      });
    } else {
      attentionBanners.push({
        id: "clear",
        title: "All caught up!",
        subtitle: `${employees} active employees · ${presentToday} present today · no pending approvals`,
        href: "/m/hr/employees",
        severity: "clear",
        qtyText: "✓",
        category: "Everything looks good",
      });
    }
  }

  const totalPending = pendingDprCount + pendingLeaveCount + (draftPayroll ? 1 : 0);

  return (
    <div>
      {/* ── 1. Attention banner carousel ── */}
      <AttentionBannerCarousel
        banners={attentionBanners}
        approvalsCount={totalPending}
      />

      {/* ── 2. Field / People toggle + quick actions ── */}
      <HrInteractive />

      {/* ── 3. Traffic-light attendance summary (D10) ── */}
      {(tierStats.red + tierStats.yellow + tierStats.green) > 0 ? (
        <div className="mb-3">
          <MobileSectionTitle>Today&apos;s Attendance Status</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {/* RED — absent / not at location */}
            <Link
              href="/m/attendance"
              className="rounded-[0.5rem] border p-2.5 text-m-body text-m-body press"
              style={{
                borderColor: "color-mix(in srgb, var(--color-stop) 30%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)",
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <Circle className="size-2 fill-current" style={{ color: "var(--color-stop)" }} />
                <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-stop)" }}>
                  Absent
                </span>
              </div>
              <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {tierStats.red}
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                not at site
              </p>
            </Link>
            {/* YELLOW — present but DPR not approved */}
            <Link
              href="/m/dprs"
              className="rounded-[0.5rem] border p-2.5 text-m-body text-m-body press"
              style={{
                borderColor: "color-mix(in srgb, var(--color-warn) 30%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--color-warn) 8%, transparent)",
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <Circle className="size-2 fill-current" style={{ color: "var(--color-warn)" }} />
                <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-warn)" }}>
                  Waiting
                </span>
              </div>
              <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {tierStats.yellow}
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                DPR pending
              </p>
            </Link>
            {/* GREEN — present + DPR approved */}
            <Link
              href="/m/attendance"
              className="rounded-[0.5rem] border p-2.5 text-m-body text-m-body press"
              style={{
                borderColor: "color-mix(in srgb, var(--color-go) 30%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--color-go) 8%, transparent)",
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <Circle className="size-2 fill-current" style={{ color: "var(--color-go)" }} />
                <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-go)" }}>
                  Clear
                </span>
              </div>
              <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {tierStats.green}
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                DPR approved
              </p>
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── 4. Workforce breakdown — trade + site presence ── */}
      <SectionHead title="Workforce" />
      <WorkforceBreakdown
        trades={tradeBreakdown}
        sitePresence={sitePresence}
        totalHeadcount={employees}
      />

      {/* ── 5. Pending approvals queue ── */}
      {totalPending > 0 ? (
        <>
          <MobileSectionTitle>Pending approvals</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-3">
            {pendingDprCount > 0 && (
              <MobileRow
                href="/m/dprs"
                icon={ClipboardList}
                title="DPRs pending approval"
                subtitle={`${pendingDprCount} daily progress report${pendingDprCount !== 1 ? "s" : ""} awaiting review`}
                meta={String(pendingDprCount)}
                metaSub="DPRs"
                tone="warning"
                badge={<Badge tone="signal">pending</Badge>}
              />
            )}
            {pendingLeaveCount > 0 && (
              <MobileRow
                href="/m/hr/leaves"
                icon={CalendarDays}
                title="Leave requests pending"
                subtitle={`${pendingLeaveCount} leave application${pendingLeaveCount !== 1 ? "s" : ""} awaiting approval`}
                meta={String(pendingLeaveCount)}
                metaSub="leaves"
                tone="warning"
                badge={<Badge tone="signal">pending</Badge>}
              />
            )}
            {draftPayroll && (
              <MobileRow
                href="/m/books/payroll"
                icon={Wallet}
                title={`Payroll draft — ${new Date(2000, draftPayroll.month - 1, 1).toLocaleString("en-IN", { month: "short" })} ${draftPayroll.year}`}
                subtitle={
                  draftPayroll.totalNet
                    ? `Net: ${formatCurrency(toNum(draftPayroll.totalNet))}`
                    : "Awaiting processing"
                }
                meta="Draft"
                metaSub="payroll"
                tone="warning"
                badge={<Badge tone="signal">draft</Badge>}
              />
            )}
          </div>
          {/* Link to consolidated pending list */}
          <Link
            href="/m/hr/pending"
            className="mt-2 flex items-center justify-center gap-1 text-m-label font-semibold"
            style={{ color: "var(--color-brand)" }}
          >
            View all pending items
            <ArrowRight className="size-3" />
          </Link>
        </>
      ) : null}

      {/* ── 6. Recent DPRs ── */}
      {recentDprs.length > 0 ? (
        <>
          <MobileSectionTitle
            right={
              <Link
                href="/m/dprs"
                className="text-m-label font-semibold text-m-body press"
                style={{ color: "var(--color-ink-500)" }}
              >
                View all
              </Link>
            }
          >
            Recent DPRs
          </MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {recentDprs.map((dpr) => (
              <MobileRow
                key={dpr.id}
                href={`/m/dprs/${dpr.id}`}
                icon={FileText}
                title={dpr.project?.name ?? "—"}
                subtitle={formatDate(dpr.date)}
                badge={
                  <Badge
                    tone={
                      dpr.approvalStatus === "APPROVED"
                        ? "go"
                        : dpr.approvalStatus === "REJECTED"
                          ? "stop"
                          : "signal"
                    }
                  >
                    {dpr.approvalStatus === "SUBMITTED"
                      ? "Pending"
                      : dpr.approvalStatus === "SUB_ADMIN_APPROVED"
                        ? "Sub-Approved"
                        : dpr.approvalStatus === "APPROVED"
                          ? "Approved"
                          : "Rejected"}
                  </Badge>
                }
              />
            ))}
          </div>
        </>
      ) : (
        <MobileEmptyState
          icon={ClipboardList}
          title="No DPRs yet"
          hint="Daily progress reports will appear here once site supervisors start submitting them"
          action={
            <MobileCta href="/m/site/dpr" icon={FileText} variant="primary">
              Create first DPR
            </MobileCta>
          }
        />
      )}
    </div>
  );
}

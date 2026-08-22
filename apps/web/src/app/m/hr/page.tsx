import { Suspense } from "react";
import { connection } from "next/server";
import {
  CalendarCheck,
  ClipboardList,
  FileText,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { formatDate, formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  SectionHead,
  Badge,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";

/**
 * HR module home — the second tab.
 *
 * Covers: attendance (half/full/late), DPR (daily progress reports:
 * labor, work, attendance time), employees, payroll, tasks.
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

  const [recentDprs, employees, todayAttendance, pendingDprCount, draftPayroll] =
    await Promise.all([
      prisma.dailyProgressReport.findMany({
        where: { project: { companyId: company.id } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { project: { select: { name: true } } },
      }).catch(() => []),
      prisma.employee.count({
        where: { companyId: company.id, active: true },
      }).catch(() => 0),
      prisma.workerAttendance.count({
        where: {
          company: { id: company.id },
          date: new Date(),
        },
      }).catch(() => 0),
      prisma.dailyProgressReport.count({
        where: {
          project: { companyId: company.id },
          approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] },
        },
      }).catch(() => 0),
      prisma.payrollPeriod.findFirst({
        where: { companyId: company.id, status: "DRAFT" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true, month: true, year: true, totalNet: true },
      }).catch(() => null),
    ]);

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
      category: "Daily Progress Report Approvals",
    });
  }

  // Draft payroll
  if (draftPayroll) {
    const monthName = new Date(2000, draftPayroll.month - 1, 1).toLocaleString("en-IN", { month: "short" });
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

  // Individual pending DPRs
  for (const dpr of recentDprs.filter((d) => d.approvalStatus === "SUBMITTED" || d.approvalStatus === "SUB_ADMIN_APPROVED")) {
    attentionBanners.push({
      id: dpr.id,
      title: `Daily Progress Report — ${dpr.project?.name ?? "—"}`,
      subtitle: `${formatDate(dpr.date)} · ${dpr.approvalStatus}`,
      href: `/m/dprs/${dpr.id}`,
      severity: "low",
      qtyText: dpr.approvalStatus === "SUBMITTED" ? "New" : "Sub",
      category: "Daily Progress Report",
    });
  }

  // If no alerts, show green "all caught up"
  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `${employees} active employees · ${todayAttendance} present today · no pending approvals`,
      href: "/m/hr/employees",
      severity: "clear",
      qtyText: "✓",
      category: "Everything looks good",
    });
  }

  return (
    <div>
      {/* ── Attention banner carousel ── */}
      <AttentionBannerCarousel banners={attentionBanners} />

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileStatCard label="Workforce" value={formatNumber(employees, 0)} icon={Users} />
        <MobileStatCard label="Present Today" value={formatNumber(todayAttendance, 0)} icon={UserCheck} tone="go" />
        <MobileStatCard label="DPRs Pending" value={formatNumber(pendingDprCount, 0)} icon={AlertCircle} tone={pendingDprCount > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="On Leave" value={formatNumber(Math.max(0, employees - todayAttendance), 0)} icon={UserX} tone="neutral" />
      </div>

      {/* ── Quick actions ── */}
      <SectionHead title="Quick actions" />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileCta href="/m/dprs" icon={FileText} variant="secondary">
          Daily Progress Reports
        </MobileCta>
        <MobileCta href="/m/attendance" icon={CalendarCheck} variant="secondary">
          Attendance
        </MobileCta>
      </div>

      {/* ── Recent DPRs ── */}
      {recentDprs.length > 0 ? (
        <>
          <MobileSectionTitle>Recent DPRs</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {recentDprs.map((dpr) => (
              <MobileRow
                key={dpr.id}
                href={`/m/dprs/${dpr.id}`}
                title={`Daily Progress Report — ${dpr.project?.name ?? "—"}`}
                subtitle={formatDate(dpr.createdAt)}
                badge={
                  <Badge tone={dpr.approvalStatus === "APPROVED" ? "go" : dpr.approvalStatus === "REJECTED" ? "stop" : "signal"}>
                    {dpr.approvalStatus}
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
          hint="Daily progress reports will appear here"
        />
      )}
    </div>
  );
}

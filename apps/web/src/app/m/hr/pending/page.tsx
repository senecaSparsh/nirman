import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate, formatCurrencyCompact } from "@/lib/utils";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  ClipboardList,
  FileText,
  CalendarOff,
  Wallet,
  ShoppingCart,
  Hammer,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

export const metadata = { title: "Pending List · Nirman" };

/**
 * /m/hr/pending — mobile consolidated pending items list.
 * Shows everything that needs attention: overdue tasks, pending DPRs,
 * leave requests, draft payrolls, pending POs, and requisitions.
 */
export default function MobilePendingListPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePendingListContent />
    </Suspense>
  );
}

async function MobilePendingListContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return (
      <div className="p-4 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>You don&apos;t have access to the pending list.</p>
      </div>
    );
  }

  const [
    pendingDprs,
    pendingLeaves,
    draftPayrolls,
    pendingPurchaseOrders,
    pendingRequisitions,
    overdueTasks,
    pendingTasks,
  ] = await Promise.all([
    prisma.dailyProgressReport.findMany({
      where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, approvalStatus: "SUBMITTED" },
      orderBy: { date: "desc" },
      take: 15,
      include: {
        project: { select: { name: true } },
        submittedBy: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {...await scopeWhere("LeaveRequest"),  companyId: company.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { employee: { select: { name: true } } },
    }),
    prisma.payrollPeriod.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 5,
      include: { _count: { select: { lines: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        supplier: { select: { name: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.materialRequisition.findMany({
      where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        project: { select: { name: true } },
        requestedBy: { select: { name: true } },
      },
    }),
    prisma.task.findMany({
      where: {...await scopeWhere("Task"), 
        assignedTo: { memberships: { some: { companyId: company.id } } },
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: "asc" },
      take: 15,
      include: { assignedTo: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: {...await scopeWhere("Task"), 
        assignedTo: { memberships: { some: { companyId: company.id } } },
        status: "PENDING",
        dueDate: { gte: new Date() },
      },
      orderBy: { dueDate: "asc" },
      take: 15,
      include: { assignedTo: { select: { name: true } } },
    }),
  ]);

  const totalCount =
    pendingDprs.length + pendingLeaves.length + draftPayrolls.length +
    pendingPurchaseOrders.length + pendingRequisitions.length +
    overdueTasks.length + pendingTasks.length;

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="size-4" style={{ color: "var(--color-ink-600)" }} />
        <h1 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
          Pending List
        </h1>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-m-caption font-bold"
          style={{
            backgroundColor: totalCount > 0 ? "var(--color-signal)" : "var(--color-concrete)",
            color: "var(--color-paper)",
          }}
        >
          {totalCount}
        </span>
      </div>

      {totalCount === 0 && (
        <MobileEmptyState
          icon={ClipboardList}
          title="All caught up"
          description="Nothing pending. You're all set."
        />
      )}

      {/* Overdue tasks */}
      {overdueTasks.length > 0 && (
        <MobilePendingSection
          title="Overdue Tasks"
          icon={<AlertCircle className="size-3.5" style={{ color: "var(--color-stop)" }} />}
          count={overdueTasks.length}
          tone="stop"
        >
          {overdueTasks.map((t) => (
            <PendingRow
              key={t.id}
              title={t.title}
              subtitle={`Assigned to ${t.assignedTo?.name ?? "Unassigned"}`}
              meta={t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No due date"}
              href="/m/site/tasks"
              tone="stop"
            />
          ))}
        </MobilePendingSection>
      )}

      {/* DPRs pending approval */}
      {pendingDprs.length > 0 && (
        <MobilePendingSection
          title="DPRs Pending Approval"
          icon={<FileText className="size-3.5" style={{ color: "var(--color-signal)" }} />}
          count={pendingDprs.length}
          tone="signal"
        >
          {pendingDprs.map((d) => (
            <PendingRow
              key={d.id}
              title={d.project?.name ?? "Unknown project"}
              subtitle={d.workSummary?.slice(0, 60) ?? "No summary"}
              meta={`${formatDate(d.date)} · ${d.submittedBy?.name ?? "Unknown"}`}
              href="/m/dprs"
              tone="signal"
            />
          ))}
        </MobilePendingSection>
      )}

      {/* Leave requests */}
      {pendingLeaves.length > 0 && (
        <MobilePendingSection
          title="Leave Requests Pending"
          icon={<CalendarOff className="size-3.5" style={{ color: "var(--color-info)" }} />}
          count={pendingLeaves.length}
          tone="info"
        >
          {pendingLeaves.map((l) => (
            <PendingRow
              key={l.id}
              title={l.employee?.name ?? "Unknown"}
              subtitle={`${l.type} · ${toNum(l.days)} day${toNum(l.days) !== 1 ? "s" : ""}`}
              meta={`From ${formatDate(l.startDate)}`}
              href="/m/hr/leaves"
              tone="info"
            />
          ))}
        </MobilePendingSection>
      )}

      {/* Draft payrolls */}
      {draftPayrolls.length > 0 && (
        <MobilePendingSection
          title="Draft Payrolls"
          icon={<Wallet className="size-3.5" style={{ color: "var(--color-stop)" }} />}
          count={draftPayrolls.length}
          tone="stop"
        >
          {draftPayrolls.map((p) => (
            <PendingRow
              key={p.id}
              title={`${p.month + 1}/${p.year}`}
              subtitle={`${p._count.lines} employees`}
              meta={`Net: ${formatCurrencyCompact(toNum(p.totalNet))}`}
              href="/m/books/payroll"
              tone="stop"
            />
          ))}
        </MobilePendingSection>
      )}

      {/* Purchase orders */}
      {pendingPurchaseOrders.length > 0 && (
        <MobilePendingSection
          title="POs Pending Approval"
          icon={<ShoppingCart className="size-3.5" style={{ color: "var(--color-signal)" }} />}
          count={pendingPurchaseOrders.length}
          tone="signal"
        >
          {pendingPurchaseOrders.map((po) => (
            <PendingRow
              key={po.id}
              title={po.poNumber}
              subtitle={`${po.supplier?.name ?? "Unknown"} · ${po.project?.name ?? "No project"}`}
              meta={`Total: ${formatCurrencyCompact(toNum(po.total))}`}
              href="/m/procurement"
              tone="signal"
            />
          ))}
        </MobilePendingSection>
      )}

      {/* Requisitions */}
      {pendingRequisitions.length > 0 && (
        <MobilePendingSection
          title="Indents Pending"
          icon={<Hammer className="size-3.5" style={{ color: "var(--color-signal)" }} />}
          count={pendingRequisitions.length}
          tone="signal"
        >
          {pendingRequisitions.map((r) => (
            <PendingRow
              key={r.id}
              title={r.reqNumber}
              subtitle={`${r.project?.name ?? "No project"} · ${r.requestedBy?.name ?? "Unknown"}`}
              meta={formatDate(r.createdAt)}
              href="/m/procurement?tab=indents"
              tone="signal"
            />
          ))}
        </MobilePendingSection>
      )}

      {/* Upcoming tasks */}
      {pendingTasks.length > 0 && (
        <MobilePendingSection
          title="Upcoming Tasks"
          icon={<ClipboardList className="size-3.5" style={{ color: "var(--color-ink-500)" }} />}
          count={pendingTasks.length}
          tone="neutral"
        >
          {pendingTasks.map((t) => (
            <PendingRow
              key={t.id}
              title={t.title}
              subtitle={`Assigned to ${t.assignedTo?.name ?? "Unassigned"}`}
              meta={t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No due date"}
              href="/m/site/tasks"
              tone="neutral"
            />
          ))}
        </MobilePendingSection>
      )}
    </div>
  );
}

function MobilePendingSection({
  title,
  icon,
  count,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  tone: "stop" | "signal" | "info" | "neutral";
  children: React.ReactNode;
}) {
  const accentColor = {
    stop: "var(--color-stop)",
    signal: "var(--color-signal)",
    info: "var(--color-info)",
    neutral: "var(--color-ink-400)",
  }[tone];

  return (
    <div
      className="rounded-[0.75rem] border overflow-hidden"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        {icon}
        <h2 className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
          {title}
        </h2>
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-m-caption font-bold"
          style={{ backgroundColor: accentColor, color: "var(--color-paper)" }}
        >
          {count}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
        {children}
      </div>
    </div>
  );
}

function PendingRow({
  title,
  subtitle,
  meta,
  href,
  tone,
}: {
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  tone: "stop" | "signal" | "info" | "neutral";
}) {
  const dotColor = {
    stop: "var(--color-stop)",
    signal: "var(--color-signal)",
    info: "var(--color-info)",
    neutral: "var(--color-ink-400)",
  }[tone];

  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 active:opacity-60 transition-opacity"
    >
      <div className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
      <div className="min-w-0 flex-1">
        <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
          {title}
        </p>
        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
          {subtitle}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{meta}</p>
      </div>
      <ArrowRight className="size-3 shrink-0" style={{ color: "var(--color-ink-400)" }} />
    </Link>
  );
}

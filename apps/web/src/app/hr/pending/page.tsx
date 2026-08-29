import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { NoAccess } from "@/components/no-access";
import { formatDate, formatCurrency } from "@/lib/utils";
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

export const metadata = { title: "Pending List · Nirman" };

/**
 * /hr/pending — consolidated pending items across the system.
 *
 * The client asked for a "task/pending list" in the HR module: one place
 * where a manager can see everything that needs their attention —
 * pending DPR approvals, leave requests, draft payrolls, pending POs,
 * pending requisitions, and overdue tasks. Rather than checking each
 * module separately, this page aggregates them all.
 */
export default function PendingListPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading pending items…" variant="list" />}>
      <PendingListContent />
    </Suspense>
  );
}

async function PendingListContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return <NoAccess what="the pending list" />;
  }

  const canApproveDpr = hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN) || hasPermission(role, PERM.DPR_APPROVE_ADMIN);
  const canApprovePo = hasPermission(role, PERM.PO_APPROVE);
  const canApproveRequisition = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canManagePayroll = hasPermission(role, PERM.PAYROLL_MANAGE);

  const [
    pendingDprs,
    pendingLeaves,
    draftPayrolls,
    pendingPurchaseOrders,
    pendingRequisitions,
    overdueTasks,
    pendingTasks,
  ] = await Promise.all([
    // DPRs awaiting approval
    prisma.dailyProgressReport.findMany({
      where: { companyId: company.id, approvalStatus: "SUBMITTED" },
      orderBy: { date: "desc" },
      take: 20,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
      },
    }),
    // Leave requests pending
    prisma.leaveRequest.findMany({
      where: { companyId: company.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { employee: { select: { id: true, name: true } } },
    }),
    // Draft payroll periods
    prisma.payrollPeriod.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 10,
      include: { _count: { select: { lines: true } } },
    }),
    // Purchase orders pending approval
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    // Requisitions pending approval
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        project: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    }),
    // Overdue tasks (due date passed, not completed)
    prisma.task.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    }),
    // Pending tasks (not started, due in the future)
    prisma.task.findMany({
      where: {
        status: "PENDING",
        dueDate: { gte: new Date() },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    }),
  ]);

  const totalCount =
    pendingDprs.length +
    pendingLeaves.length +
    draftPayrolls.length +
    pendingPurchaseOrders.length +
    pendingRequisitions.length +
    overdueTasks.length +
    pendingTasks.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pending List"
        description="Everything that needs your attention — approvals, requests, and overdue tasks across all modules."
        stats={[
          { label: "Total pending", value: totalCount },
          { label: "Overdue tasks", value: overdueTasks.length },
          { label: "Awaiting approval", value: pendingDprs.length + pendingPurchaseOrders.length + pendingRequisitions.length },
        ]}
      />
      <div className="flex justify-end">
        <RefreshButton />
      </div>

      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-body font-medium text-foreground">All caught up</p>
            <p className="mt-1 text-caption text-muted-foreground">
              No pending items. Everything that needs your attention has been handled.
            </p>
          </div>
        </div>
      )}

      {/* Overdue tasks — highest priority */}
      {overdueTasks.length > 0 && (
        <PendingSection
          title="Overdue Tasks"
          icon={<AlertCircle className="h-4 w-4 text-danger" />}
          tone="danger"
          count={overdueTasks.length}
          items={overdueTasks.map((t) => ({
            id: t.id,
            title: t.title,
            subtitle: `Assigned to ${t.assignedTo?.name ?? "Unassigned"}`,
            meta: `Due ${formatDate(t.dueDate)}`,
            href: "/my-tasks",
            tone: "danger" as const,
          }))}
        />
      )}

      {/* DPRs pending approval */}
      {pendingDprs.length > 0 && (
        <PendingSection
          title="DPRs Pending Approval"
          icon={<FileText className="h-4 w-4 text-warning" />}
          tone="warning"
          count={pendingDprs.length}
          items={pendingDprs.map((d) => ({
            id: d.id,
            title: d.project?.name ?? "Unknown project",
            subtitle: d.workSummary?.slice(0, 80) ?? "No summary",
            meta: `${formatDate(d.date)} · ${d.submittedBy?.name ?? "Unknown"}`,
            href: "/hr/dprs",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Leave requests pending */}
      {pendingLeaves.length > 0 && (
        <PendingSection
          title="Leave Requests Pending"
          icon={<CalendarOff className="h-4 w-4 text-info" />}
          tone="info"
          count={pendingLeaves.length}
          items={pendingLeaves.map((l) => ({
            id: l.id,
            title: l.employee?.name ?? "Unknown employee",
            subtitle: `${l.type} · ${toNum(l.days)} day${toNum(l.days) !== 1 ? "s" : ""}`,
            meta: `From ${formatDate(l.startDate)}`,
            href: "/hr/attendance",
            tone: "info" as const,
          }))}
        />
      )}

      {/* Draft payrolls */}
      {draftPayrolls.length > 0 && (
        <PendingSection
          title="Draft Payrolls to Process"
          icon={<Wallet className="h-4 w-4 text-danger" />}
          tone="danger"
          count={draftPayrolls.length}
          items={draftPayrolls.map((p) => ({
            id: p.id,
            title: `${p.month + 1}/${p.year}`,
            subtitle: `${p._count.lines} employees`,
            meta: `Net: ${formatCurrency(toNum(p.totalNet))}`,
            href: "/hr/payroll",
            tone: "danger" as const,
          }))}
        />
      )}

      {/* Purchase orders pending approval */}
      {pendingPurchaseOrders.length > 0 && (
        <PendingSection
          title="Purchase Orders Pending Approval"
          icon={<ShoppingCart className="h-4 w-4 text-warning" />}
          tone="warning"
          count={pendingPurchaseOrders.length}
          items={pendingPurchaseOrders.map((po) => ({
            id: po.id,
            title: po.poNumber,
            subtitle: `${po.supplier?.name ?? "Unknown supplier"} · ${po.project?.name ?? "No project"}`,
            meta: `Total: ${formatCurrency(toNum(po.total))}`,
            href: "/procurement",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Requisitions pending approval */}
      {pendingRequisitions.length > 0 && (
        <PendingSection
          title="Requisitions Pending Approval"
          icon={<Hammer className="h-4 w-4 text-warning" />}
          tone="warning"
          count={pendingRequisitions.length}
          items={pendingRequisitions.map((r) => ({
            id: r.id,
            title: r.reqNumber,
            subtitle: `${r.project?.name ?? "No project"} · ${r.requestedBy?.name ?? "Unknown"}`,
            meta: formatDate(r.createdAt),
            href: "/requisitions",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Pending tasks (not overdue) */}
      {pendingTasks.length > 0 && (
        <PendingSection
          title="Upcoming Tasks"
          icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
          tone="neutral"
          count={pendingTasks.length}
          items={pendingTasks.map((t) => ({
            id: t.id,
            title: t.title,
            subtitle: `Assigned to ${t.assignedTo?.name ?? "Unassigned"}`,
            meta: t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No due date",
            href: "/my-tasks",
            tone: "neutral" as const,
          }))}
        />
      )}
    </div>
  );
}

// ── Pending section card ──

type PendingItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  tone: "danger" | "warning" | "info" | "neutral";
};

function PendingSection({
  title,
  icon,
  tone,
  count,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "danger" | "warning" | "info" | "neutral";
  count: number;
  items: PendingItem[];
}) {
  const toneClasses = {
    danger: "border-danger/20 bg-danger-soft/30",
    warning: "border-warning/20 bg-warning/5",
    info: "border-info/20 bg-info/5",
    neutral: "border-border bg-card",
  };
  const accentClasses = {
    danger: "bg-danger",
    warning: "bg-warning",
    info: "bg-info",
    neutral: "bg-muted-foreground",
  };

  return (
    <div className={`rounded-lg border ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 border-b border-inherit px-4 py-3">
        {icon}
        <h2 className="text-body font-semibold text-foreground">{title}</h2>
        <span className="ml-auto rounded-full bg-foreground/10 px-2 py-0.5 text-caption font-medium text-foreground">
          {count}
        </span>
      </div>
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle"
          >
            <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentClasses[item.tone]}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-caption font-medium text-foreground">{item.title}</p>
              <p className="truncate text-micro text-muted-foreground">{item.subtitle}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-micro text-muted-foreground">{item.meta}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma, type DprApprovalStatus } from "@nirman/db";
import { getCompany, getCurrentUser, toNum, scopeWhere, getUserPermissions, getActingRole, getScopedRolePermissions } from "@/lib/server";
import { actionableApprovals, actionableGatePassWhere } from "@/lib/approval-actionable";
import { canAutoApprove, canWaiveSelfApproval } from "@nirman/services";
import { notCreatedBy, notSubmittedBy } from "@/lib/approval-queue";
import { PERM } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
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
  ShieldCheck,
  Receipt,
  IndianRupee,
  UserCheck,
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
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.HR_VIEW)) {
    return <NoAccess what="the pending list" permission={PERM.HR_VIEW} />;
  }

  // The sidebar badge sums actionableApprovalCounts (10 types) — every type it
  // counts must render here or an approver sees a number they can't reach
  // (badge ⊆ page). Scoped perms + self-approval mirrors match the badge.
  const __scopedPerms = await getScopedRolePermissions();
  const __allPerms = new Set([...__effPerms, ...__scopedPerms]);
  const __user = await getCurrentUser();
  const __acting = await getActingRole();
  const __selfNotSubmitted = !__user || canWaiveSelfApproval(__acting) ? {} : notSubmittedBy(__user.id);
  const __selfNotCreated = !__user || canAutoApprove(__acting) ? {} : notCreatedBy(__user.id);
  const _canApproveExpense = __allPerms.has(PERM.EXPENSE_APPROVE);
  const _canApproveRaBill = __allPerms.has(PERM.RA_APPROVE);
  const _canManageHr = __allPerms.has(PERM.HR_MANAGE);
  // Badge splits DPR tiers: sub-admins act on SUBMITTED, admins on
  // SUB_ADMIN_APPROVED — show only the statuses this user can advance.
  const __dprStatuses: DprApprovalStatus[] = [];
  if (__allPerms.has(PERM.DPR_APPROVE_SUB_ADMIN)) __dprStatuses.push("SUBMITTED");
  if (__allPerms.has(PERM.DPR_APPROVE_ADMIN)) __dprStatuses.push("SUB_ADMIN_APPROVED");

  const now = new Date();
  const gatePassWhere = await actionableGatePassWhere(company.id);
  const [
    pendingDprs,
    dprCount,
    pendingLeaves,
    leaveCount,
    draftPayrolls,
    payrollCount,
    approvals,
    pendingGatePasses,
    gatePassCount,
    overdueTasks,
    overdueCount,
    pendingTasks,
    pendingTaskCount,
    pendingRaBills,
    raBillCount,
    pendingExpenses,
    expenseCount,
    pendingClaims,
    claimCount,
    pendingAdvances,
    advanceCount,
    pendingCorrections,
    correctionCount,
  ] = await Promise.all([
    // DPRs awaiting approval — only the tier this user can act on, and not
    // their own submissions (same split as the badge).
    __dprStatuses.length > 0
      ? prisma.dailyProgressReport.findMany({
          where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, approvalStatus: { in: __dprStatuses }, ...__selfNotSubmitted },
          orderBy: { date: "desc" },
          take: 20,
          include: {
            project: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true } },
          },
        })
      : [],
    __dprStatuses.length > 0
      ? prisma.dailyProgressReport.count({
          where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, approvalStatus: { in: __dprStatuses }, ...__selfNotSubmitted },
        })
      : 0,
    // Leave requests pending — HR_MANAGE only, same as the badge.
    _canManageHr
      ? prisma.leaveRequest.findMany({
          where: {...await scopeWhere("LeaveRequest"),  companyId: company.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { employee: { select: { id: true, name: true } } },
        })
      : [],
    _canManageHr
      ? prisma.leaveRequest.count({
          where: {...await scopeWhere("LeaveRequest"),  companyId: company.id, status: "PENDING" },
        })
      : 0,
    // Draft payroll periods
    prisma.payrollPeriod.findMany({
      where: { companyId: company.id, status: "DRAFT", year: { lte: new Date().getFullYear() + 1 } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 10,
      include: { _count: { select: { lines: true } } },
    }),
    prisma.payrollPeriod.count({ where: { companyId: company.id, status: "DRAFT", year: { lte: new Date().getFullYear() + 1 } } }),
    // Purchase orders pending approval
    // Requisitions pending approval
    actionableApprovals(company.id),
    // Gate passes pending approval — the sidebar badge counts these via
    // /api/approvals, so the page must show them too (badge ⊆ page).
    gatePassWhere
      ? prisma.gatePass.findMany({
          where: gatePassWhere,
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true } },
          },
        })
      : [],
    gatePassWhere ? prisma.gatePass.count({ where: gatePassWhere }) : 0,
    // Overdue tasks (due date passed, not completed)
    prisma.task.findMany({
      where: {...await scopeWhere("Task"), 
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueDate: { lt: now },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.task.count({
      where: {...await scopeWhere("Task"), 
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueDate: { lt: now },
      },
    }),
    // Pending tasks (not started, due in the future)
    prisma.task.findMany({
      where: {...await scopeWhere("Task"), 
        status: "PENDING",
        dueDate: { gte: now },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    }),
    prisma.task.count({
      where: {...await scopeWhere("Task"), 
        status: "PENDING",
        dueDate: { gte: now },
      },
    }),
    // Remaining badge types (badge ⊆ page) — each mirrors its
    // actionableApprovalCounts where-clause exactly.
    _canApproveRaBill
      ? prisma.raBill.findMany({
          where: { ...(await scopeWhere("RaBill")), companyId: company.id, status: "SUBMITTED", ...__selfNotSubmitted, ...__selfNotCreated },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { project: { select: { id: true, name: true } }, workOrder: { select: { subcontractor: { select: { name: true } } } } },
        })
      : [],
    _canApproveRaBill
      ? prisma.raBill.count({
          where: { ...(await scopeWhere("RaBill")), companyId: company.id, status: "SUBMITTED", ...__selfNotSubmitted, ...__selfNotCreated },
        })
      : 0,
    _canApproveExpense
      ? prisma.expense.findMany({
          where: { ...(await scopeWhere("Expense")), companyId: company.id, status: "PENDING", ...__selfNotSubmitted },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { project: { select: { id: true, name: true } } },
        })
      : [],
    _canApproveExpense
      ? prisma.expense.count({
          where: { ...(await scopeWhere("Expense")), companyId: company.id, status: "PENDING", ...__selfNotSubmitted },
        })
      : 0,
    _canApproveExpense
      ? prisma.expenseClaim.findMany({
          where: { ...(await scopeWhere("ExpenseClaim", {})), companyId: company.id, status: "SUBMITTED", ...__selfNotSubmitted },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { submittedBy: { select: { id: true, name: true } } },
        })
      : [],
    _canApproveExpense
      ? prisma.expenseClaim.count({
          where: { ...(await scopeWhere("ExpenseClaim", {})), companyId: company.id, status: "SUBMITTED", ...__selfNotSubmitted },
        })
      : 0,
    _canManageHr
      ? prisma.employeeAdvance.findMany({
          where: { ...(await scopeWhere("EmployeeAdvance")), companyId: company.id, status: "REQUESTED" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { employee: { select: { id: true, name: true } } },
        })
      : [],
    _canManageHr
      ? prisma.employeeAdvance.count({
          where: { ...(await scopeWhere("EmployeeAdvance")), companyId: company.id, status: "REQUESTED" },
        })
      : 0,
    _canManageHr
      ? prisma.attendanceCorrectionRequest.findMany({
          where: { ...(await scopeWhere("AttendanceCorrectionRequest")), companyId: company.id, status: "REQUESTED" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { employee: { select: { id: true, name: true } } },
        })
      : [],
    _canManageHr
      ? prisma.attendanceCorrectionRequest.count({
          where: { ...(await scopeWhere("AttendanceCorrectionRequest")), companyId: company.id, status: "REQUESTED" },
        })
      : 0,
  ]);

  const awaitingApproval =
    dprCount + leaveCount + approvals.pos.length + approvals.reqs.length + gatePassCount +
    raBillCount + expenseCount + claimCount + advanceCount + correctionCount;
  const totalCount = awaitingApproval + payrollCount + overdueCount + pendingTaskCount;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pending List"
        description="Everything that needs your attention — approvals, requests, and overdue tasks across all modules."
        stats={[
          { label: "Total pending", value: totalCount },
          { label: "Overdue tasks", value: overdueCount },
          { label: "Awaiting approval", value: awaitingApproval },
        ]}
      />
      <div className="flex justify-end">
        <RefreshButton />
      </div>

      {totalCount === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title="All caught up"
          description="Nothing pending here — items waiting on your approval live in Approvals."
          action={
            <Link href="/approvals" className="text-caption font-medium text-brand hover:underline">
              Go to Approvals →
            </Link>
          }
        />
      )}

      {/* Overdue tasks — highest priority */}
      {overdueCount > 0 && (
        <PendingSection
          title="Overdue Tasks"
          icon={<AlertCircle className="h-4 w-4 text-danger" />}
          tone="danger"
          count={overdueCount}
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
      {dprCount > 0 && (
        <PendingSection
          title="DPRs Pending Approval"
          icon={<FileText className="h-4 w-4 text-warning" />}
          tone="warning"
          count={dprCount}
          items={pendingDprs.map((d) => ({
            id: d.id,
            title: d.project?.name ?? "Unknown project",
            subtitle: d.workSummary?.slice(0, 80) ?? "No summary",
            meta: `${formatDate(d.date)} · ${d.submittedBy?.name ?? "Unknown"}`,
            href: `/dprs?id=${d.id}`,
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Leave requests pending */}
      {leaveCount > 0 && (
        <PendingSection
          title="Leave Requests Pending"
          icon={<CalendarOff className="h-4 w-4 text-info" />}
          tone="info"
          count={leaveCount}
          items={pendingLeaves.map((l) => ({
            id: l.id,
            title: l.employee?.name ?? "Unknown employee",
            subtitle: `${l.type} · ${toNum(l.days)} day${toNum(l.days) !== 1 ? "s" : ""}`,
            meta: `From ${formatDate(l.startDate)}`,
            href: "/hr/attendance?tab=leave",
            tone: "info" as const,
          }))}
        />
      )}

      {/* Draft payrolls */}
      {payrollCount > 0 && (
        <PendingSection
          title="Draft Payrolls to Process"
          icon={<Wallet className="h-4 w-4 text-danger" />}
          tone="danger"
          count={payrollCount}
          items={draftPayrolls.map((p) => ({
            id: p.id,
            title: `${p.month}/${p.year}`,
            subtitle: `${p._count.lines} employees`,
            meta: `Net: ${formatCurrency(toNum(p.totalNet))}`,
            href: "/hr/payroll",
            tone: "danger" as const,
          }))}
        />
      )}

      {/* Purchase orders pending approval */}
      {approvals.pos.length > 0 && (
        <PendingSection
          title="Purchase Orders Pending Approval"
          icon={<ShoppingCart className="h-4 w-4 text-warning" />}
          tone="warning"
          count={approvals.pos.length}
          items={approvals.pos.slice(0, 20).map((po) => ({
            id: po.id,
            title: po.poNumber,
            subtitle: `${po.supplier?.name ?? "Unknown supplier"} · ${po._count.lines} line${po._count.lines === 1 ? "" : "s"}`,
            meta: `Total: ${formatCurrency(toNum(po.total))}`,
            href: `/procurement?po=${po.id}`,
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Requisitions pending approval */}
      {approvals.reqs.length > 0 && (
        <PendingSection
          title="Indents Pending Approval"
          icon={<Hammer className="h-4 w-4 text-warning" />}
          tone="warning"
          count={approvals.reqs.length}
          items={approvals.reqs.slice(0, 20).map((r) => ({
            id: r.id,
            title: r.reqNumber,
            subtitle: `${r.project?.name ?? "No project"} · ${r._count.lines} line${r._count.lines === 1 ? "" : "s"}`,
            meta: formatDate(r.createdAt),
            href: "/requisitions",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Gate passes pending approval */}
      {gatePassCount > 0 && (
        <PendingSection
          title="Gate Passes Pending Approval"
          icon={<ShieldCheck className="h-4 w-4 text-warning" />}
          tone="warning"
          count={gatePassCount}
          items={pendingGatePasses.map((g) => ({
            id: g.id,
            title: g.gatePassNumber,
            subtitle: `${g.project?.name ?? "No project"} · ${g.category.replaceAll("_", " ").toLowerCase()}`,
            meta: g.submittedBy?.name ?? "Unassigned",
            href: "/gate-passes",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* RA bills pending approval */}
      {raBillCount > 0 && (
        <PendingSection
          title="RA Bills Pending Approval"
          icon={<FileText className="h-4 w-4 text-warning" />}
          tone="warning"
          count={raBillCount}
          items={pendingRaBills.map((b) => ({
            id: b.id,
            title: b.raBillNumber,
            subtitle: `${b.workOrder?.subcontractor?.name ?? "Subcontractor"} · ${b.project?.name ?? "No project"}`,
            meta: formatCurrency(toNum(b.netPayable)),
            href: "/work-orders",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Expenses pending approval */}
      {expenseCount > 0 && (
        <PendingSection
          title="Expenses Pending Approval"
          icon={<Wallet className="h-4 w-4 text-warning" />}
          tone="warning"
          count={expenseCount}
          items={pendingExpenses.map((e) => ({
            id: e.id,
            title: e.category.replaceAll("_", " ").toLowerCase(),
            subtitle: e.project?.name ?? "No project",
            meta: formatCurrency(toNum(e.amount)),
            href: "/finance?tab=expenses",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Expense claims pending approval */}
      {claimCount > 0 && (
        <PendingSection
          title="Expense Claims Pending Approval"
          icon={<Receipt className="h-4 w-4 text-warning" />}
          tone="warning"
          count={claimCount}
          items={pendingClaims.map((c) => ({
            id: c.id,
            title: c.description?.slice(0, 60) || "Expense claim",
            subtitle: `Submitted by ${c.submittedBy?.name ?? "Unknown"}`,
            meta: formatDate(c.createdAt),
            href: "/finance?tab=claims",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Advance requests pending */}
      {advanceCount > 0 && (
        <PendingSection
          title="Advance Requests"
          icon={<IndianRupee className="h-4 w-4 text-warning" />}
          tone="warning"
          count={advanceCount}
          items={pendingAdvances.map((a) => ({
            id: a.id,
            title: a.employee?.name ?? "Unknown employee",
            subtitle: "Salary advance requested",
            meta: formatCurrency(toNum(a.amount)),
            href: "/approvals",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Attendance correction requests pending */}
      {correctionCount > 0 && (
        <PendingSection
          title="Punch-fix Requests"
          icon={<UserCheck className="h-4 w-4 text-warning" />}
          tone="warning"
          count={correctionCount}
          items={pendingCorrections.map((c) => ({
            id: c.id,
            title: c.employee?.name ?? "Unknown employee",
            subtitle: c.reason?.slice(0, 60) || "Attendance correction",
            meta: formatDate(c.date),
            href: "/approvals",
            tone: "warning" as const,
          }))}
        />
      )}

      {/* Pending tasks (not overdue) */}
      {pendingTaskCount > 0 && (
        <PendingSection
          title="Upcoming Tasks"
          icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
          tone="neutral"
          count={pendingTaskCount}
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
      {count > items.length && (
        <p className="border-t border-inherit px-4 py-2 text-micro text-muted-foreground">
          Showing {items.length} of {count}
        </p>
      )}
    </div>
  );
}

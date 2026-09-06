import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import {
  SectionHead,
  Badge,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import {
  Wallet,
  Receipt,
  IndianRupee,
  CreditCard,
  FileText,
  PieChart,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

/**
 * /m/expenses-hub — structured expense hub.
 *
 * Groups all expense-related pages into one place:
 * - Operating Expenses (book + approve)
 * - Expense Claims (employee reimbursements)
 * - Petty Cash (site/office floats)
 * - Supplier Payments (cheques, bank, TDS)
 * - Supplier Invoices (GRN-based billing)
 * - Reports (expenses by category, payroll, P&L, budget variance)
 *
 * Permission-aware: field workers see Claims + Petty Cash only;
 * finance/managers see everything.
 */
export default function ExpensesHubPage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <ExpensesHubContent />
    </Suspense>
  );
}

async function ExpensesHubContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canViewFinance = hasPermission(role, PERM.FINANCE_VIEW);
  const canCreateExpense = hasPermission(role, PERM.EXPENSE_CREATE);

  // ── KPIs ──
  const [approvedTotal, pendingTotal, pendingClaimsCount, pettyCashTotal] = await Promise.all([
    prisma.expense
      .aggregate({
        where: { companyId: company.id, status: "APPROVED" },
        _sum: { amount: true },
      })
      .then((r) => toNum(r._sum.amount))
      .catch(() => 0),
    prisma.expense
      .aggregate({
        where: { companyId: company.id, status: "PENDING" },
        _sum: { amount: true },
      })
      .then((r) => toNum(r._sum.amount))
      .catch(() => 0),
    prisma.expenseClaim
      .count({
        where: { companyId: company.id, status: "SUBMITTED" },
      })
      .catch(() => 0),
    prisma.pettyCashFloat
      .aggregate({
        where: { companyId: company.id },
        _sum: { floatAmount: true },
      })
      .then((r) => toNum(r._sum.floatAmount))
      .catch(() => 0),
  ]);

  // ── Pending approvals (recent) ──
  const [pendingExpenses, pendingClaims] = await Promise.all([
    canViewFinance
      ? prisma.expense
          .findMany({
            where: { companyId: company.id, status: "PENDING" },
            orderBy: { date: "desc" },
            take: 3,
            select: {
              id: true,
              category: true,
              amount: true,
              date: true,
              payeeName: true,
              project: { select: { name: true } },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.expenseClaim
      .findMany({
        where: { companyId: company.id, status: "SUBMITTED" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          description: true,
          totalAmount: true,
          createdAt: true,
          claimant: { select: { name: true } },
        },
      })
      .catch(() => []),
  ]);

  return (
    <div className="px-3 pb-20 pt-2">
      {/* ── KPIs — grid of 4 ── */}
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        <MobileStatCard
          label="Approved"
          value={formatCurrencyCompact(approvedTotal)}
          tone="go"
        />
        <MobileStatCard
          label="Pending"
          value={formatCurrencyCompact(pendingTotal)}
          tone={pendingTotal > 0 ? "signal" : "neutral"}
        />
        <MobileStatCard
          label="Claims"
          value={String(pendingClaimsCount)}
          tone={pendingClaimsCount > 0 ? "signal" : "neutral"}
        />
        <MobileStatCard
          label="Petty Cash"
          value={formatCurrencyCompact(pettyCashTotal)}
          tone="neutral"
        />
      </div>

      {/* ── Pending Approvals ── */}
      {(pendingExpenses.length > 0 || pendingClaims.length > 0) && (
        <div className="mb-4">
          <SectionHead title="Pending Approvals" />
          <div className="flex flex-col gap-1.5">
            {pendingExpenses.map((e) => (
              <Link
                key={e.id}
                href={`/m/expenses`}
                className="flex items-center justify-between rounded-[0.5rem] p-2.5 press"
                style={{ backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle
                    className="size-4 shrink-0"
                    style={{ color: "var(--color-signal-dark)" }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-m-label font-medium truncate"
                      style={{ color: "var(--color-ink-900)" }}
                    >
                      {e.payeeName || e.category}
                    </div>
                    <div
                      className="text-m-caption truncate"
                      style={{ color: "var(--color-ink-400)" }}
                    >
                      {e.project?.name ?? "No project"}
                    </div>
                  </div>
                </div>
                <span
                  className="text-m-label font-semibold shrink-0"
                  style={{ color: "var(--color-signal-dark)" }}
                >
                  {formatCurrency(toNum(e.amount))}
                </span>
              </Link>
            ))}
            {pendingClaims.map((c) => (
              <Link
                key={c.id}
                href={`/m/expense-claims/${c.id}`}
                className="flex items-center justify-between rounded-[0.5rem] p-2.5 press"
                style={{ backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle
                    className="size-4 shrink-0"
                    style={{ color: "var(--color-signal-dark)" }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-m-label font-medium truncate"
                      style={{ color: "var(--color-ink-900)" }}
                    >
                      {c.description || "Expense claim"}
                    </div>
                    <div
                      className="text-m-caption truncate"
                      style={{ color: "var(--color-ink-400)" }}
                    >
                      {c.claimant?.name ?? "Unknown"}
                    </div>
                  </div>
                </div>
                <span
                  className="text-m-label font-semibold shrink-0"
                  style={{ color: "var(--color-signal-dark)" }}
                >
                  {formatCurrency(toNum(c.totalAmount))}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Two sections side by side: Expenses + Reports ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* ── Expenses section ── */}
        <div className="flex flex-col gap-1.5">
          <SectionHead title="Expenses" />
          <ExpenseLink
            href="/m/expense-claims"
            icon={Receipt}
            title="Claims"
            subtitle="Reimbursements"
            badge={pendingClaimsCount > 0 ? pendingClaimsCount : undefined}
            compact
          />
          <ExpenseLink
            href="/m/petty-cash"
            icon={IndianRupee}
            title="Petty Cash"
            subtitle="Cash floats"
            compact
          />
          {canViewFinance && (
            <>
              <ExpenseLink
                href="/m/expenses"
                icon={Wallet}
                title="Operating"
                subtitle="Book & approve"
                compact
              />
              <ExpenseLink
                href="/m/supplier-payments"
                icon={CreditCard}
                title="Payments"
                subtitle="Cheques, TDS"
                compact
              />
              <ExpenseLink
                href="/m/books/finance"
                icon={FileText}
                title="Invoices"
                subtitle="GRN billing"
                compact
              />
            </>
          )}
        </div>

        {/* ── Reports section ── */}
        {canViewFinance ? (
          <div className="flex flex-col gap-1.5">
            <SectionHead title="Reports" />
            <ExpenseLink
              href="/m/reports/expenses"
              icon={PieChart}
              title="By Category"
              subtitle="Spending breakdown"
              compact
            />
            <ExpenseLink
              href="/m/reports/payroll-expense"
              icon={Wallet}
              title="Payroll"
              subtitle="By trade/crew"
              compact
            />
            <ExpenseLink
              href="/m/reports/profit"
              icon={TrendingUp}
              title="P&L"
              subtitle="Income vs expense"
              compact
            />
            <ExpenseLink
              href="/m/budget-variance"
              icon={TrendingUp}
              title="Budget"
              subtitle="Vs actual"
              compact
            />
          </div>
        ) : (
          /* Field workers: show a tip instead of reports */
          <div className="flex flex-col gap-1.5">
            <SectionHead title="Quick Actions" />
            <Link
              href="/m/expense-claims"
              className="flex items-center gap-2 rounded-[0.5rem] p-2.5 press"
              style={{
                backgroundColor: "var(--color-signal-wash)",
                border: "1px solid color-mix(in srgb, var(--color-signal) 30%, transparent)",
              }}
            >
              <Receipt
                className="size-4 shrink-0"
                style={{ color: "var(--color-signal-dark)" }}
              />
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-signal-dark)" }}
              >
                New Claim
              </span>
            </Link>
          </div>
        )}
      </div>

      {/* ── Quick action: New Expense ── */}
      {canCreateExpense && canViewFinance && (
        <Link
          href="/m/expenses"
          className="mt-4 flex items-center justify-center gap-2 rounded-[0.5rem] p-3 press"
          style={{
            backgroundColor: "var(--color-signal-wash)",
            border: "1px solid color-mix(in srgb, var(--color-signal) 30%, transparent)",
          }}
        >
          <Wallet
            className="size-4"
            style={{ color: "var(--color-signal-dark)" }}
          />
          <span
            className="text-m-body font-semibold"
            style={{ color: "var(--color-signal-dark)" }}
          >
            New Expense
          </span>
        </Link>
      )}
    </div>
  );
}

/** A structured link row with icon, title, subtitle, and optional badge. */
function ExpenseLink({
  href,
  icon: Icon,
  title,
  subtitle,
  badge,
  compact = false,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: number;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[0.5rem] press"
      style={{
        backgroundColor: "var(--color-paper)",
        padding: compact ? "0.625rem 0.5rem" : "0.625rem",
      }}
    >
      <div
        className="grid place-items-center size-7 rounded-[0.25rem] shrink-0"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon
          className="size-3.5"
          style={{ color: "var(--color-ink-500)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-m-label font-semibold truncate"
          style={{ color: "var(--color-ink-900)" }}
        >
          {title}
        </div>
        <div
          className="text-m-caption truncate"
          style={{ color: "var(--color-ink-400)" }}
        >
          {subtitle}
        </div>
      </div>
      {badge !== undefined && (
        <Badge tone="signal">{badge}</Badge>
      )}
      <ArrowRight
        className="size-3 shrink-0"
        style={{ color: "var(--color-ink-400)" }}
      />
    </Link>
  );
}

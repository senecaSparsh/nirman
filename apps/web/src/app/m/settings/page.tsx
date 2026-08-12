import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import {
  User,
  Users,
  Bell,
  TrendingUp,
  Wallet,
  Receipt,
  AlertTriangle,
  ChevronRight,
  LogOut,
  Download,
  Shield,
  Calendar,
} from "lucide-react";
import { prisma } from "@nirman/db";
import {
  getCompanyPortfolioSummary,
  getSupplierOutstanding,
  getTallySyncStats,
} from "@nirman/services";
import { getCompany, getCurrentUser, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  SectionHead,
  Badge,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { CompanySwitcher } from "./company-switcher";

/**
 * /m/settings — Settings & Portfolio hub.
 *
 * This is the 4th bottom-nav tab. It consolidates:
 *   1. Company portfolio (overview, last-month summary, dues analysis)
 *   2. Company switcher (for owners with multiple companies)
 *   3. User profile + account
 *   4. Team & permissions (admin/owner)
 *   5. Bulk export
 *   6. Notification settings
 *   7. Sign out
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  await connection();
  const company = await getCompany();
  const user = await getCurrentUser();

  const isOwner = user?.role === "OWNER" || user?.role === "ADMIN";

  // ── Fetch all data in parallel ──
  const [
    portfolio,
    supplierOutstanding,
    tallyStats,
    userCompanies,
    teamMembers,
    recentActivity,
    lastMonthRevenue,
    , // pendingDues (unused)
    receivableDues,
  ] = await Promise.all([
    // Portfolio summary
    getCompanyPortfolioSummary(company.id).catch(() => ({
      totalPortfolioValue: 0,
      totalRevenue: 0,
      soldUnits: 0,
      availableUnits: 0,
      unsoldAssetValue: 0,
      activeProjectCount: 0,
    })),
    // Supplier outstanding (payables)
    getSupplierOutstanding(company.id).catch(() => []),
    // Tally sync stats
    getTallySyncStats(company.id).catch(() => ({
      total: 0, synced: 0, failed: 0, pending: 0, imported: 0, variance: 0,
    })),
    // User's companies (for switcher)
    user
      ? prisma.userCompany.findMany({
          where: { userId: user.id },
          include: { company: { select: { id: true, name: true, deletedAt: true } } },
        }).then((m) => m.filter((m) => m.company.deletedAt === null))
      : [],
    // Team members
    isOwner
      ? prisma.userCompany.findMany({
          where: { companyId: company.id },
          include: { user: { select: { id: true, name: true, email: true, active: true } } },
          take: 20,
        })
      : [],
    // Recent audit activity (last 10)
    prisma.auditLog.findMany({
      where: { companyId: company.id },
      orderBy: { timestamp: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        timestamp: true,
        user: { select: { name: true } },
      },
    }).catch(() => []),
    // Last month revenue (asset sale payments + material sale payments)
    prisma.assetSalePayment.aggregate({
      where: {
        paymentDate: { gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) },
        assetSale: { companyId: company.id },
      },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
    // Pending payables (overdue POs)
    prisma.purchaseOrder.count({
      where: {
        companyId: company.id,
        status: { in: ["RECEIVED", "PARTIAL"] },
      },
    }).catch(() => 0),
    // Receivable dues (unpaid asset sales)
    prisma.assetSale.count({
      where: {
        companyId: company.id,
        paymentStatus: { in: ["PENDING", "PARTIAL"] },
      },
    }).catch(() => 0),
  ]);

  const totalPayables = supplierOutstanding.reduce(
    (s, o) => s + toNum(o.balanceOwed),
    0,
  );
  const lastMonthRev = toNum(lastMonthRevenue._sum?.amount ?? 0);

  // Last month date range
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthName = lastMonth.toLocaleString("en-IN", { month: "long" });

  return (
    <div>
      {/* ── Company header ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid place-items-center w-10 h-10 rounded-[0.5rem] shrink-0 text-[1.125rem] font-bold"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "#fff",
            }}
          >
            {company.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="font-bold text-[0.875rem] truncate"
              style={{ color: "var(--color-ink-950)" }}
            >
              {company.name}
            </p>
            <p
              className="text-[0.5625rem] mt-0.5"
              style={{ color: "var(--color-ink-500)" }}
            >
              {company.currency} · {user?.role ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Company switcher (if multiple companies) ── */}
      {userCompanies.length > 1 ? (
        <div className="mb-3">
          <CompanySwitcher
            currentCompanyId={company.id}
            companies={userCompanies.map((m) => ({
              id: m.company.id,
              name: m.company.name,
              role: m.role,
            }))}
          />
        </div>
      ) : null}

      {/* ── Last month summary ── */}
      <SectionHead title={`${monthName} summary`} />
      <div
        className="rounded-[0.625rem] border p-2.5 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <SummaryStat
            label="Revenue"
            value={formatCurrency(lastMonthRev)}
            tone="go"
          />
          <SummaryStat
            label="Payables"
            value={formatCurrency(totalPayables)}
            tone="stop"
          />
          <SummaryStat
            label="Units sold"
            value={formatNumber(portfolio.soldUnits, 0)}
          />
          <SummaryStat
            label="Active projects"
            value={formatNumber(portfolio.activeProjectCount, 0)}
          />
        </div>
      </div>

      {/* ── Dues & analysis (owner) ── */}
      {isOwner ? (
        <>
          <SectionHead title="Dues & analysis" />
          <div className="flex flex-col gap-2 mb-3">
            <DuesRow
              icon={Receipt}
              label="Pending payables"
              value={formatCurrency(totalPayables)}
              hint={`${supplierOutstanding.length} vendors`}
              tone="stop"
              href="/m/books"
            />
            <DuesRow
              icon={Wallet}
              label="Receivable dues"
              value={`${receivableDues} sales`}
              hint="partial/unpaid"
              tone="signal"
              href="/m/books/receipts"
            />
            <DuesRow
              icon={TrendingUp}
              label="Portfolio value"
              value={formatCurrency(toNum(portfolio.totalPortfolioValue))}
              hint={`${portfolio.availableUnits} units available`}
              tone="go"
              href="/m/projects"
            />
            <DuesRow
              icon={AlertTriangle}
              label="Tally pending"
              value={formatNumber(tallyStats.pending, 0)}
              hint={tallyStats.pending > 0 ? "awaiting sync" : "all synced"}
              tone={tallyStats.pending > 0 ? "stop" : "go"}
              href="/m/books/gl"
            />
          </div>
        </>
      ) : null}

      {/* ── Account & profile ── */}
      <SectionHead title="Account" />
      <div className="flex flex-col gap-2 mb-3">
        <MobileRow
          href="/m/me"
          icon={User}
          title={user?.name ?? "Profile"}
          subtitle={user?.email ?? "—"}
          badge={<Badge tone="steel">{user?.role ?? "—"}</Badge>}
        />
        <MobileRow
          icon={Calendar}
          title="My activity"
          subtitle="Your recent actions"
          meta={formatDate(now)}
        />
      </div>

      {/* ── Administration (owner/admin) ── */}
      {isOwner ? (
        <>
          <SectionHead title="Administration" />
          <div className="flex flex-col gap-2 mb-3">
            <MobileRow
              href="/m/settings/team"
              icon={Users}
              title="Team & permissions"
              subtitle={`${teamMembers.length} members`}
              meta="Manage"
            />
            <MobileRow
              href="/m/settings/export"
              icon={Download}
              title="Bulk export"
              subtitle="CSV / PDF data export"
              meta="Export"
            />
            <MobileRow
              icon={Shield}
              title="Security & access"
              subtitle="Roles, permissions matrix"
              meta="View"
            />
          </div>
        </>
      ) : null}

      {/* ── Notifications ── */}
      <SectionHead title="Notifications" />
      <div className="flex flex-col gap-2 mb-3">
        <MobileRow
          href="/m/settings/notifications"
          icon={Bell}
          title="Alert preferences"
          subtitle="Low stock, approvals, dues"
          meta="Configure"
        />
      </div>

      {/* ── Recent activity ── */}
      {recentActivity.length > 0 ? (
        <>
          <MobileSectionTitle>Recent activity</MobileSectionTitle>
          <div className="flex flex-col gap-1.5 mb-3">
            {recentActivity.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-2 rounded-[0.5rem] border p-2"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                <span
                  className="shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--color-steel)" }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[0.625rem] font-semibold truncate"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {log.action}
                  </p>
                  <p
                    className="text-[0.5rem] mt-0.5"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {log.user?.name ?? "System"} · {formatDate(log.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Sign out ── */}
      <div className="mt-4 mb-4">
        <SignOutButton />
      </div>

      {/* ── App info ── */}
      <p
        className="text-center text-[0.5rem] mb-4"
        style={{ color: "var(--color-ink-300)" }}
      >
        Nirman Inventory OS v1.0
      </p>
    </div>
  );
}

/* ── Summary stat tile (compact, for the monthly summary) ── */
function SummaryStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "go" | "stop" | "signal";
}) {
  const color = {
    neutral: "var(--color-ink-950)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal-dark)",
  }[tone];
  return (
    <div
      className="rounded-[0.5rem] p-2"
      style={{ backgroundColor: "var(--color-paper-2)" }}
    >
      <p
        className="text-[0.5rem] uppercase tracking-wide font-semibold"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
      </p>
      <p
        className="text-[0.8125rem] font-bold numeric mt-0.5"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Dues row — colored left border, like needs-attention cards ── */
function DuesRow({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  hint?: string;
  tone: "go" | "stop" | "signal";
  href: string;
}) {
  const color = {
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal-dark)",
  }[tone];
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-[0.625rem] border border-l-4 p-2.5 press"
      style={{
        borderColor: "var(--color-line)",
        borderLeftColor: color,
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[0.6875rem] font-semibold leading-tight"
          style={{ color: "var(--color-ink-950)" }}
        >
          {label}
        </p>
        {hint ? (
          <p
            className="text-[0.5rem] mt-0.5"
            style={{ color: "var(--color-ink-500)" }}
          >
            {hint}
          </p>
        ) : null}
      </div>
      <span
        className="text-[0.75rem] font-bold numeric shrink-0"
        style={{ color }}
      >
        {value}
      </span>
      <ChevronRight
        className="size-3.5 shrink-0"
        style={{ color: "var(--color-ink-300)" }}
      />
    </Link>
  );
}

/* ── Sign out button ── */
function SignOutButton() {
  return (
    <form action="/api/auth/sign-out" method="POST">
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] border-2 p-2.5 text-[0.75rem] font-semibold press"
        style={{
          borderColor: "var(--color-stop)",
          color: "var(--color-stop)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </form>
  );
}

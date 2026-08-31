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
  Calendar,
  Building2,
  Shield,
  Monitor,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@nirman/db";
import {
  getCompanyPortfolioSummary,
  getSupplierOutstanding,
  getTallySyncStats,
} from "@nirman/services";
import { getCompany, getCurrentUser, toNum } from "@/lib/server";
import {formatCurrencyCompact, formatNumber, formatDate, humanizeAuditAction} from "@/lib/utils";
import {
  MobileRow,
  Badge,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { InstallAppRow } from "@/components/mobile/install-prompt";
import { ThemeToggleRow } from "@/components/mobile/theme-toggle-row";
import { CurrencyToggleRow } from "@/components/mobile/currency-toggle-row";
import { CompanySwitcher } from "./company-switcher";

/**
 * /m/settings — Settings & Portfolio hub.
 *
 * This is the 4th bottom-nav tab. It's a settings + owner-dashboard hybrid,
 * organized into clear conceptual zones with visual separation:
 *
 *   1. Company context — header + switcher (the anchor)
 *   2. Business overview (owner only) — last month summary + dues
 *   3. Profile — user info, my activity
 *   4. Administration (owner only) — company, team, export, permissions
 *   5. Notifications — alert preferences
 *   6. App — theme, currency, install
 *   7. Recent activity — audit log feed
 *   8. Sign out + version
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
    // Recent audit activity (last 8)
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
  const payableVendorCount = supplierOutstanding.filter((o) => toNum(o.balanceOwed) > 0).length;

  const now = new Date();

  return (
    <div>
      {/* ════════════════════════════════════════════════════════════════════
          ZONE 1 — COMPANY CONTEXT
          The anchor: who am I and which company am I in.
          Merged header + switcher — tappable to switch when multiple.
          ════════════════════════════════════════════════════════════════════ */}
      <div className="mb-4">
        <CompanySwitcher
          currentCompanyId={company.id}
          currency={company.currency}
          role={user?.role ?? "—"}
          parentCompanyId={company.parentCompanyId}
          companies={userCompanies.map((m) => ({
            id: m.company.id,
            name: m.company.name,
            role: m.role,
          }))}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 2 — BUSINESS OVERVIEW (owner/admin only)
          A mini-dashboard: last month's numbers + dues that need attention.
          Clearly separated as "business" not "settings".
          ════════════════════════════════════════════════════════════════════ */}
      {isOwner ? (
        <ZoneDivider label="Business overview" />
      ) : null}

      {isOwner ? (
        <>
          {/* Dues & analysis — colored-border rows */}
          <div className="flex flex-col gap-2 mb-4">
            <DuesRow
              icon={Receipt}
              label="Pending payables"
              value={formatCurrencyCompact(totalPayables)}
              hint={`${payableVendorCount} vendors with dues`}
              tone="stop"
              href="/m/accounts"
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
              value={formatCurrencyCompact(toNum(portfolio.totalPortfolioValue))}
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

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 3 — PROFILE
          Who am I and what am I doing here.
          ════════════════════════════════════════════════════════════════════ */}
      <ZoneDivider label="Profile" />
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow
          href="/m/me"
          icon={User}
          title={user?.name ?? "Profile"}
          subtitle={user?.email ?? "—"}
          meta="Edit"
          badge={<Badge tone="steel">{user?.role ?? "—"}</Badge>}
        />
        <MobileRow
          href="/m/queue"
          icon={Calendar}
          title="My activity"
          subtitle="Offline queue & recent actions"
          meta={formatDate(now)}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 4 — ADMINISTRATION (owner/admin only)
          Company config, team management, data export, permissions.
          ════════════════════════════════════════════════════════════════════ */}
      {isOwner ? (
        <>
          <ZoneDivider label="Administration" />
          <div className="flex flex-col gap-2 mb-4">
            <MobileRow
              href="/m/settings/company"
              icon={Building2}
              title="Company details"
              subtitle="Name, GSTIN, PAN, address, phone"
              meta="Edit"
            />
            <MobileRow
              href="/m/settings/team"
              icon={Users}
              title="Team & permissions"
              subtitle={`${teamMembers.length} members`}
              meta="Manage"
            />
            <MobileRow
              href="/m/stock-locations"
              icon={MapPin}
              title="Stock locations"
              subtitle="Warehouses, project sites, departments"
              meta="Manage"
            />
            <MobileRow
              href="/m/permissions"
              icon={Shield}
              title="Permission matrix"
              subtitle="Role-based access control"
              meta="View"
            />
            <MobileRow
              href="/m/settings/export"
              icon={Download}
              title="Bulk export"
              subtitle="CSV / PDF data export"
              meta="Export"
            />
          </div>
        </>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 5 — NOTIFICATIONS
          Alert preferences and delivery settings.
          ════════════════════════════════════════════════════════════════════ */}
      <ZoneDivider label="Notifications" />
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow
          href="/m/settings/notifications"
          icon={Bell}
          title="Alert preferences"
          subtitle="Low stock, approvals, dues"
          meta="Configure"
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 6 — APP
          Theme, currency, install — personal device preferences.
          ════════════════════════════════════════════════════════════════════ */}
      <ZoneDivider label="App" />
      <div className="flex flex-col gap-2 mb-4">
        <ThemeToggleRow />
        <CurrencyToggleRow />
        <InstallAppRow />
        <Link
          href="/?desktop=1"
          className="flex items-center gap-2.5 rounded-[0.5rem] border px-3 py-2.5 text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Monitor className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
              View desktop site
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Switch to the full desktop ERP interface
            </p>
          </div>
          <ChevronRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        </Link>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 7 — RECENT ACTIVITY
          Audit log feed — informational, at the bottom.
          ════════════════════════════════════════════════════════════════════ */}
      {recentActivity.length > 0 ? (
        <>
          <ZoneDivider label="Recent activity" />
          <div className="flex flex-col gap-1.5 mb-4">
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
                    className="text-m-label font-semibold truncate"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {humanizeAuditAction(log.action)}
                  </p>
                  <p
                    className="text-m-caption mt-0.5"
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

      {/* ════════════════════════════════════════════════════════════════════
          ZONE 8 — SIGN OUT + VERSION
          The exit, at the very bottom.
          ════════════════════════════════════════════════════════════════════ */}
      <div className="mt-2 mb-4">
        <SignOutButton />
      </div>

      <p
        className="text-center text-m-caption mb-4"
        style={{ color: "var(--color-ink-300)" }}
      >
        Nirman Inventory OS v1.0
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE DIVIDER — a subtle label that separates conceptual groups.
   Replaces SectionHead with a lighter, more spaced treatment that reads
   as a zone boundary rather than a section title.
   ═══════════════════════════════════════════════════════════════════════════ */
function ZoneDivider({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 mb-2 mt-1"
    >
      <span
        className="text-m-caption font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--color-ink-300)" }}
      >
        {label}
      </span>
      <span
        className="flex-1 h-px"
        style={{ backgroundColor: "var(--color-line)" }}
      />
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
  icon: LucideIcon;
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
      className="flex items-center gap-2.5 rounded-[0.625rem] border border-l-4 p-2.5 text-m-body press"
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
          className="text-m-body font-semibold leading-tight"
          style={{ color: "var(--color-ink-950)" }}
        >
          {label}
        </p>
        {hint ? (
          <p
            className="text-m-caption mt-0.5"
            style={{ color: "var(--color-ink-500)" }}
          >
            {hint}
          </p>
        ) : null}
      </div>
      <span
        className="text-m-section font-bold tabular-nums shrink-0"
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
        className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] border-2 p-2.5 text-m-section font-semibold text-m-body press"
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

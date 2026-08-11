import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  getCompanyPortfolioSummary,
  getTallySyncStats,
  lowStockAlerts,
} from "@nirman/services";
import {
  ClipboardCheck,
  TrendingUp,
  Package,
  Building2,
  AlertTriangle,
  Boxes,
  ShoppingCart,
  Plus,
  Wallet,
} from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";

/**
 * Executive persona home — "Pulse".
 * OWNER / ADMIN. The Cockpit: a lightweight home that shows the owner
 * the most important numbers and routes them to drill-down pages.
 *
 * Architecture: this page loads ONLY summary counts + the top 5 projects.
 * Heavy data (per-project P&L, full alert lists, cash flow) lives on
 * dedicated drill-down pages:
 *   /m/pulse/attention  — all alerts in one place
 *   /m/pulse/projects   — per-project health cards
 *   /m/pulse/approvals  — approve/reject queue
 *   /m/pulse/inventory  — inventory at a glance
 */
export default function PulsePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <PulseContent />
    </Suspense>
  );
}

async function PulseContent() {
  await connection();
  const company = await getCompany();

  // ── Lightweight summary queries ───────────────────────────────
  // The portfolio summary uses cached Project fields (kept fresh by
  // reallocateProjectCosts) — no per-project P&L recomputation here.
  const [
    portfolio,
    tallyStats,
    lowStock,
    draftPOs,
    pendingReqs,
    overduePOs,
    recentSales,
  ] = await Promise.all([
    getCompanyPortfolioSummary(company.id),
    getTallySyncStats(company.id).catch(() => ({
      total: 0,
      synced: 0,
      failed: 0,
      pending: 0,
      imported: 0,
      variance: 0,
    })),
    lowStockAlerts(company.id).catch(() => []),
    prisma.purchaseOrder.count({
      where: { companyId: company.id, status: "DRAFT" },
    }),
    prisma.materialRequisition.count({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
    }),
    prisma.purchaseOrder.count({
      where: {
        companyId: company.id,
        status: { in: ["ORDERED", "PARTIAL"] },
        expectedDate: { lt: new Date() },
      },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const approvalCount = draftPOs + pendingReqs;
  const attentionCount =
    approvalCount + overduePOs + lowStock.length + tallyStats.pending;
  const topProjects = portfolio.projects.slice(0, 5);

  return (
    <div>
      <MobilePageHeader
        title="Pulse"
        subtitle={company.name}
        right={<MobileRefreshButton />}
      />

      {/* ── KPI strip — 4 tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Portfolio"
          value={formatCurrency(toNum(portfolio.totalPortfolioValue))}
          hint={`${portfolio.activeProjectCount} active projects`}
          icon={Building2}
          tone="brand"
        />
        <MobileStatCard
          label="Revenue"
          value={formatCurrency(toNum(portfolio.totalRevenue))}
          hint={`${formatNumber(portfolio.soldUnits, 0)} units sold`}
          icon={TrendingUp}
          tone="success"
        />
        <MobileStatCard
          label="Avg Margin"
          value={`${formatNumber(toNum(portfolio.avgMarginPct), 1)}%`}
          hint={`${formatCurrency(toNum(portfolio.totalProfit))} profit`}
          icon={Wallet}
        />
        <MobileStatCard
          label="Units Avail."
          value={formatNumber(portfolio.availableUnits, 0)}
          hint={`${formatCurrency(toNum(portfolio.unsoldAssetValue))} value`}
          icon={Package}
        />
      </div>

      {/* ── Attention queue — one card, drills down ─────────────── */}
      <div className="px-4 pt-1">
        <MobileCta href="/m/pulse/attention" icon={AlertTriangle}>
          {attentionCount > 0
            ? `${attentionCount} things need you`
            : "Nothing needs you"}
        </MobileCta>
      </div>

      {/* ── Approvals — count + link ─────────────────────────────── */}
      <div className="px-4 pt-2">
        <MobileCta
          href="/m/pulse/approvals"
          icon={ClipboardCheck}
          variant={approvalCount > 0 ? "primary" : "outline"}
        >
          {approvalCount > 0
            ? `Approvals · ${approvalCount}`
            : "Approvals queue"}
        </MobileCta>
      </div>

      {/* ── Inventory — count + link ─────────────────────────────── */}
      <div className="px-4 pt-2">
        <MobileCta href="/m/pulse/inventory" icon={Boxes} variant="outline">
          Inventory at a glance
        </MobileCta>
      </div>

      {/* ── Quick actions ────────────────────────────────────────── */}
      <MobileSectionTitle>Quick actions</MobileSectionTitle>
      <div className="flex gap-2 px-4 pb-1">
        <Link
          href="/m/sales/new"
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] border border-border bg-card px-3 py-2.5 text-[0.8125rem] font-semibold text-foreground transition-colors active:scale-[0.99] active:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          New Sale
        </Link>
        <Link
          href="/m/requisitions"
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] border border-border bg-card px-3 py-2.5 text-[0.8125rem] font-semibold text-foreground transition-colors active:scale-[0.99] active:bg-accent"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          New Req
        </Link>
        <TallySyncButton pendingCount={tallyStats.pending} />
      </div>

      {/* ── Project health — top 5, drills down ──────────────────── */}
      <MobileSectionTitle>
        <div className="flex items-center justify-between">
          <span>Project health</span>
          <Link
            href="/m/pulse/projects"
            className="text-caption font-medium text-brand active:opacity-70"
          >
            View all
          </Link>
        </div>
      </MobileSectionTitle>
      {topProjects.length === 0 ? (
        <MobileEmptyState
          icon={Building2}
          title="No projects yet"
          hint="Projects show here once created"
        />
      ) : (
        <div>
          {topProjects.map((p) => {
            const budget = toNum(p.totalBudget);
            const cost = toNum(p.totalCost);
            const variancePct =
              budget > 0 ? ((cost - budget) / budget) * 100 : 0;
            const tone =
              variancePct > 10
                ? "danger"
                : variancePct > 0
                  ? "warning"
                  : "success";
            return (
              <MobileRow
                key={p.id}
                href={`/m/projects`}
                icon={Building2}
                title={p.name}
                subtitle={`${formatCurrency(cost)} spent · ${formatNumber(p.soldUnits, 0)}/${formatNumber(p.unitCount, 0)} sold`}
                meta={
                  budget > 0
                    ? `${variancePct >= 0 ? "+" : ""}${formatNumber(variancePct, 1)}%`
                    : undefined
                }
                tone={tone}
                badge={<MobileStatusBadge status={p.status} />}
              />
            );
          })}
        </div>
      )}

      {/* ── Recent sales — top 3 ─────────────────────────────────── */}
      <MobileSectionTitle>Recent sales</MobileSectionTitle>
      {recentSales.length === 0 ? (
        <MobileEmptyState icon={TrendingUp} title="No active sales" />
      ) : (
        <div>
          {recentSales.map((s) => (
            <MobileRow
              key={s.id}
              href={`/m/sales/new`}
              icon={Wallet}
              title={s.customer.name}
              subtitle={formatDate(s.createdAt)}
              meta={formatCurrency(toNum(s.salePrice))}
              tone="success"
            />
          ))}
        </div>
      )}

      {/* ── Reports shortcut ─────────────────────────────────────── */}
      <MobileSectionTitle>Reports</MobileSectionTitle>
      <div className="px-4 pb-4">
        <MobileCta href="/m/pulse/reports" icon={TrendingUp} variant="outline">
          View analytics
        </MobileCta>
      </div>
    </div>
  );
}

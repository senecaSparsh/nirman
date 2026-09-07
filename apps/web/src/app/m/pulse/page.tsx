import Link from "next/link";
import { prisma } from "@nirman/db";
import {
  getCompanyPortfolioSummary,
  getTallySyncStats,
  lowStockAlerts,
  leaseExpiryAlerts,
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
import { toNum } from "@/lib/server";
import { formatCurrencyCompact, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";

/**
 * Executive persona home — "Pulse".
 * OWNER / ADMIN. The Cockpit: a lightweight home that shows the owner
 * the most important numbers and routes them to drill-down pages.
 *
 * Architecture: this page loads ONLY summary counts + the top 5 projects.
 * Heavy data (per-project P&L, full alert lists, cash flow) lives on
 * dedicated drill-down pages:
 *   /m/pulse/attention  — all alerts in one place
 *   /m/pulse/projects   — redirects to /m/projects
 *   /m/pulse/approvals  — approve/reject queue
 *   /m/pulse/inventory  — redirects to /m/materials
 */
export default function PulsePage() {
  return (
    <MobileHubPage>
      {async ({ company }) => {
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
          overBudgetCount,
          leaseExpiry,
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
          prisma.project.count({
            where: {
              companyId: company.id,
              deletedAt: null,
              status: { in: ["PLANNED", "ACTIVE"] },
              totalBudget: { gt: 0 },
              totalProjectCost: { gt: 0 },
            },
          }),
          leaseExpiryAlerts(company.id).catch(() => []),
          prisma.assetSale.findMany({
            where: { companyId: company.id, status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { customer: { select: { name: true } } },
          }),
        ]);

        const approvalCount = draftPOs + pendingReqs;
        const attentionCount =
          approvalCount + overduePOs + lowStock.length + overBudgetCount + tallyStats.pending + leaseExpiry.length;
        const topProjects = portfolio.projects.slice(0, 5);

        return (
          <div>
            {/* ── KPI strip — 4 tiles ──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              <MobileStatCard
                label="Portfolio"
                value={formatCurrencyCompact(toNum(portfolio.totalPortfolioValue))}
                hint={`${portfolio.activeProjectCount} active`}
                icon={Building2}
                tone="signal"
              />
              <MobileStatCard
                label="Revenue"
                value={formatCurrencyCompact(toNum(portfolio.totalRevenue))}
                hint={`${formatNumber(portfolio.soldUnits, 0)} sold`}
                icon={TrendingUp}
                tone="go"
              />
              <MobileStatCard
                label="Avg Margin"
                value={`${formatNumber(toNum(portfolio.avgMarginPct), 1)}%`}
                hint={`${formatCurrencyCompact(toNum(portfolio.totalProfit))}`}
                icon={Wallet}
              />
              <MobileStatCard
                label="Units Avail."
                value={formatNumber(portfolio.availableUnits, 0)}
                hint={`${formatCurrencyCompact(toNum(portfolio.unsoldAssetValue))}`}
                icon={Package}
              />
            </div>

            {/* ── Attention queue — one card, drills down ─────────────── */}
            <div className="mb-3">
              <MobileCta href="/m/pulse/attention" icon={AlertTriangle} variant="primary">
                {attentionCount > 0
                  ? `${attentionCount} things need you`
                  : "Nothing needs you"}
              </MobileCta>
            </div>

            {/* ── Approvals + Inventory — side by side ─────────────────── */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <MobileCta
                href="/m/pulse/approvals"
                icon={ClipboardCheck}
                variant={approvalCount > 0 ? "primary" : "secondary"}
              >
                {approvalCount > 0
                  ? `Approvals · ${approvalCount}`
                  : "Approvals"}
              </MobileCta>
              <MobileCta href="/m/materials" icon={Boxes} variant="secondary">
                Inventory
              </MobileCta>
            </div>

            {/* ── Quick actions ────────────────────────────────────────── */}
            <MobileSectionTitle>Quick actions</MobileSectionTitle>
            <div className="flex gap-2 mb-4">
              <Link
                href="/m/sales/new"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] border-2 px-3 py-2.5 text-m-section font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)" }}
              >
                <Plus className="size-3.5" />
                New Sale
              </Link>
              <Link
                href="/m/procurement?tab=indents"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] border-2 px-3 py-2.5 text-m-section font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)" }}
              >
                <ShoppingCart className="size-3.5" />
                New Requisition
              </Link>
              <TallySyncButton pendingCount={tallyStats.pending} />
            </div>

            {/* ── Project health — top 5, drills down ──────────────────── */}
            <MobileSectionTitle>
              <div className="flex items-center justify-between">
                <span>Project health</span>
                <Link
                  href="/m/real-estate?tab=projects"
                  className="text-m-caption font-bold text-m-body press"
                  style={{ color: "var(--color-signal-dark)" }}
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
              <div className="flex flex-col gap-2.5">
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
                      subtitle={`${formatCurrencyCompact(cost)} spent · ${formatNumber(p.soldUnits, 0)}/${formatNumber(p.unitCount, 0)} sold`}
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
              <div className="flex flex-col gap-2.5">
                {recentSales.map((s) => (
                  <MobileRow
                    key={s.id}
                    href={`/m/sales/${s.id}`}
                    icon={Wallet}
                    title={s.customer.name}
                    subtitle={formatDate(s.createdAt)}
                    meta={formatCurrencyCompact(toNum(s.salePrice))}
                    tone="success"
                  />
                ))}
              </div>
            )}

            {/* ── Reports shortcut ─────────────────────────────────────── */}
            <MobileSectionTitle>Reports</MobileSectionTitle>
            <div className="mb-4">
              <MobileCta href="/m/books/reports" icon={TrendingUp} variant="secondary">
                View analytics
              </MobileCta>
            </div>
          </div>
        );
      }}
    </MobileHubPage>
  );
}

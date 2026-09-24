import Link from "next/link";
import { prisma } from "@nirman/db";
import {
  getCompanyPortfolioSummary,
  getTallySyncStats,
  lowStockAlerts,
  leaseExpiryAlerts,
  canAutoApprove,
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
import { toNum, scopeWhere, getCurrentUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
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
 *   /m/projects         — per-project drill-down
 *   /m/pulse/approvals  — redirects to /m/approvals (approve/reject queue)
 *   /m/materials        — inventory drill-down
 */
export default function PulsePage() {
  return (
    <MobileHubPage perm={PERM.FINANCE_VIEW} what="executive dashboard" permission="finance.view">
      {async ({ company, actingRole }) => {
        // ── Lightweight summary queries ───────────────────────────────
        // The portfolio summary uses cached Project fields (kept fresh by
        // reallocateProjectCosts) — no per-project P&L recomputation here.
        // Approval counts must match /m/pulse/attention: it hides the
        // viewer's own pending items for non-tier-1 approvers (they can't
        // self-approve), so "N things need you" stays honest.
        const user = await getCurrentUser();
        const hideSelf = !canAutoApprove(actingRole);
        const notSelf = hideSelf && user ? { not: user.id } : undefined;
        const [
          portfolio,
          tallyStats,
          lowStock,
          draftPOs,
          pendingReqs,
          pendingDprs,
          pendingClaims,
          pendingGatePasses,
          pendingExpenses,
          pendingRaBills,
          oldestPO,
          oldestReq,
          oldestDpr,
          oldestClaim,
          overduePOs,
          overBudgetProjects,
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
            where: { companyId: company.id, status: "DRAFT", createdById: notSelf },
          }),
          prisma.materialRequisition.count({
            where: { ...await scopeWhere("MaterialRequisition"), project: { companyId: company.id }, status: "SUBMITTED", requestedById: notSelf },
          }),
          prisma.dailyProgressReport.count({
            where: { companyId: company.id, approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] }, submittedById: notSelf },
          }),
          prisma.expenseClaim.count({
            where: { companyId: company.id, status: "SUBMITTED", claimantId: notSelf, ...await scopeWhere("ExpenseClaim", {}) },
          }),
          // Same categories the attention drill-down counts — keep the
          // headline number consistent with the detail page.
          prisma.gatePass.count({
            where: { companyId: company.id, status: "PENDING", submittedById: notSelf },
          }),
          prisma.expense.count({
            where: { companyId: company.id, status: "PENDING", submittedById: notSelf },
          }),
          prisma.raBill.count({
            where: { companyId: company.id, status: "SUBMITTED", createdById: notSelf, submittedById: notSelf },
          }),
          // Approval aging — the oldest item waiting in each queue. When
          // these sit >48h the owner needs to see it (and the cron
          // escalation job nudges the responsible manager).
          prisma.purchaseOrder.aggregate({
            where: { companyId: company.id, status: "DRAFT" },
            _min: { createdAt: true },
          }),
          prisma.materialRequisition.aggregate({
            where: { project: { companyId: company.id }, status: "SUBMITTED" },
            _min: { createdAt: true },
          }),
          prisma.dailyProgressReport.aggregate({
            where: { companyId: company.id, approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] } },
            _min: { createdAt: true },
          }),
          prisma.expenseClaim.aggregate({
            where: { companyId: company.id, status: "SUBMITTED" },
            _min: { submittedAt: true },
          }),
          prisma.purchaseOrder.count({
            where: {
              companyId: company.id,
              status: { in: ["ORDERED", "PARTIAL"] },
              expectedDate: { lt: new Date() },
            },
          }),
          // Matches /m/pulse/attention: only projects where actual spend
          // exceeds budget — not every project that has both fields set.
          prisma.project.findMany({
            where: {
              companyId: company.id,
              deletedAt: null,
              status: { in: ["PLANNED", "ACTIVE"] },
              totalBudget: { gt: 0 },
              totalProjectCost: { gt: 0 },
            },
            select: { totalBudget: true, totalProjectCost: true },
          }),
          leaseExpiryAlerts(company.id).catch(() => []),
          prisma.assetSale.findMany({
            where: {...await scopeWhere("AssetSale"),  companyId: company.id, status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { customer: { select: { name: true } } },
          }),
        ]);

        const approvalCount = draftPOs + pendingReqs + pendingDprs + pendingClaims + pendingGatePasses + pendingExpenses + pendingRaBills;
        const oldestPendingAt = [
          oldestPO._min.createdAt,
          oldestReq._min.createdAt,
          oldestDpr._min.createdAt,
          oldestClaim._min.submittedAt,
        ]
          .filter((d): d is Date => d != null)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        const oldestApprovalDays = oldestPendingAt
          ? Math.floor((new Date().getTime() - oldestPendingAt.getTime()) / 86_400_000)
          : 0;
        const overBudgetCount = overBudgetProjects.filter(
          (p) => toNum(p.totalProjectCost) > toNum(p.totalBudget),
        ).length;
        const attentionCount =
          approvalCount + overduePOs + lowStock.length + overBudgetCount + tallyStats.pending + leaseExpiry.length;
        const topProjects = portfolio.projects.slice(0, 5);

        return (
          <div>
            {/* ── KPI strip — 4 tiles ──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2 mb-4">
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
                  ? `Approvals · ${approvalCount}${oldestApprovalDays >= 2 ? ` · oldest ${oldestApprovalDays} days` : ""}`
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
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[0.625rem] border px-2 text-m-label font-semibold text-m-body press whitespace-nowrap"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)" }}
              >
                <Plus className="size-3.5" />
                New Sale
              </Link>
              <Link
                href="/m/procurement?tab=indents"
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[0.625rem] border px-2 text-m-label font-semibold text-m-body press whitespace-nowrap"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)" }}
              >
                <ShoppingCart className="size-3.5" />
                Requisition
              </Link>
              <TallySyncButton pendingCount={tallyStats.pending} />
            </div>

            {/* ── Project health — top 5, drills down ──────────────────── */}
            <MobileSectionTitle
              right={
                <Link
                  href="/m/real-estate?tab=projects"
                  className="text-m-label font-semibold text-m-body press"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  View all
                </Link>
              }
            >
              Project health
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
                  // Show budget UTILISATION, not signed variance — "94% used"
                  // reads correctly at a glance; "-94.2%" looked like a loss.
                  const usedPct = budget > 0 ? (cost / budget) * 100 : 0;
                  const tone =
                    usedPct > 110
                      ? "danger"
                      : usedPct > 100
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
                          ? `${formatNumber(usedPct, 0)}% used`
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

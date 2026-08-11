import { Suspense } from "react";
import { connection } from "next/server";
import { getCompanyPortfolioSummary } from "@nirman/services";
import { Building2, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileRefreshButton,
  MobileStatCard,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";

/**
 * Project health drill-down — per-project P&L summary.
 *
 * Shows every project with budget vs actual, variance %, margin, and
 * unit sales progress. Tapping a project goes to /m/projects (the
 * existing list page) for now — a dedicated /m/projects/[id] detail
 * page is a follow-up.
 */
export default function ProjectsHealthPage() {
  return (
    <Suspense
      fallback={
        <div>
          <MobilePageHeader title="Project health" right={<MobileRefreshButton />} />
          <MobileEmptyState icon={Building2} title="Loading…" />
        </div>
      }
    >
      <ProjectsHealthContent />
    </Suspense>
  );
}

async function ProjectsHealthContent() {
  await connection();
  const company = await getCompany();
  const portfolio = await getCompanyPortfolioSummary(company.id);

  const overBudget = portfolio.projects.filter(
    (p) => toNum(p.totalBudget) > 0 && toNum(p.totalCost) > toNum(p.totalBudget),
  );
  const onTrack = portfolio.projects.filter(
    (p) => toNum(p.totalBudget) > 0 && toNum(p.totalCost) <= toNum(p.totalBudget),
  );
  const noBudget = portfolio.projects.filter((p) => toNum(p.totalBudget) === 0);

  return (
    <div>
      <MobilePageHeader
        title="Project health"
        subtitle={`${portfolio.projects.length} projects`}
        right={<MobileRefreshButton />}
      />

      {/* ── Portfolio totals ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Total Revenue"
          value={formatCurrency(toNum(portfolio.totalRevenue))}
          icon={TrendingUp}
          tone="success"
        />
        <MobileStatCard
          label="Total Cost"
          value={formatCurrency(toNum(portfolio.totalCost))}
          icon={Wallet}
        />
        <MobileStatCard
          label="Total Profit"
          value={formatCurrency(toNum(portfolio.totalProfit))}
          hint={`${formatNumber(toNum(portfolio.avgMarginPct), 1)}% avg margin`}
          icon={TrendingUp}
          tone={toNum(portfolio.totalProfit) >= 0 ? "success" : "danger"}
        />
        <MobileStatCard
          label="Units Sold"
          value={`${portfolio.soldUnits}/${portfolio.totalUnits}`}
          hint={`${portfolio.availableUnits} available`}
          icon={Building2}
        />
      </div>

      {/* ── Over budget ─────────────────────────────────────────── */}
      {overBudget.length > 0 && (
        <>
          <MobileSectionTitle>
            Over budget ({overBudget.length})
          </MobileSectionTitle>
          <div>
            {overBudget.map((p) => {
              const budget = toNum(p.totalBudget);
              const cost = toNum(p.totalCost);
              const overrunPct = budget > 0 ? ((cost - budget) / budget) * 100 : 0;
              return (
                <MobileRow
                  key={p.id}
                  href="/m/projects"
                  icon={AlertTriangle}
                  title={p.name}
                  subtitle={`${formatCurrency(cost)} / ${formatCurrency(budget)}`}
                  meta={`+${formatNumber(overrunPct, 1)}%`}
                  tone="danger"
                  badge={<MobileStatusBadge status={p.status} />}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ── On track ────────────────────────────────────────────── */}
      {onTrack.length > 0 && (
        <>
          <MobileSectionTitle>
            On track ({onTrack.length})
          </MobileSectionTitle>
          <div>
            {onTrack.map((p) => {
              const budget = toNum(p.totalBudget);
              const cost = toNum(p.totalCost);
              const variancePct = budget > 0 ? ((cost - budget) / budget) * 100 : 0;
              const margin = toNum(p.marginPct);
              return (
                <MobileRow
                  key={p.id}
                  href="/m/projects"
                  icon={Building2}
                  title={p.name}
                  subtitle={`${formatCurrency(cost)} / ${formatCurrency(budget)} · ${formatNumber(p.soldUnits, 0)}/${formatNumber(p.unitCount, 0)} sold`}
                  meta={`${formatNumber(variancePct, 1)}% · ${formatNumber(margin, 1)}%`}
                  tone="success"
                  badge={<MobileStatusBadge status={p.status} />}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ── No budget set ───────────────────────────────────────── */}
      {noBudget.length > 0 && (
        <>
          <MobileSectionTitle>
            No budget ({noBudget.length})
          </MobileSectionTitle>
          <div>
            {noBudget.map((p) => (
              <MobileRow
                key={p.id}
                href="/m/projects"
                icon={Building2}
                title={p.name}
                subtitle={`${formatCurrency(toNum(p.totalCost))} spent · ${formatNumber(p.soldUnits, 0)}/${formatNumber(p.unitCount, 0)} sold`}
                meta={toNum(p.revenue) > 0 ? `${formatNumber(toNum(p.marginPct), 1)}%` : undefined}
                badge={<MobileStatusBadge status={p.status} />}
              />
            ))}
          </div>
        </>
      )}

      {portfolio.projects.length === 0 && (
        <MobileEmptyState
          icon={Building2}
          title="No projects yet"
          hint="Projects show here once created"
        />
      )}

      <div className="h-4" />
    </div>
  );
}

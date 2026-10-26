"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet, Building2, ArrowRight, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardToolbar } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, toNum} from "@/lib/utils";

export interface CashPositionData {
  cashBalance: number;
  arBalance: number;
  apBalance: number;
  inventoryValue: number;
}

export interface ProjectProfitRow {
  id: string;
  name: string;
  status: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

/**
 * Owner Financial Dashboard — a role-gated section on the command center
 * that shows the owner their cash position and project profitability at
 * a glance. Only rendered for OWNER/ADMIN roles.
 */
export function OwnerFinancialDashboard({
  cashPosition,
  projectProfits,
}: {
  cashPosition: CashPositionData;
  projectProfits: ProjectProfitRow[];
}) {
  const netCash = cashPosition.cashBalance + cashPosition.arBalance - cashPosition.apBalance;
  const totalRevenue = projectProfits.reduce((s, p) => s + toNum(p.revenue), 0);
  const totalCost = projectProfits.reduce((s, p) => s + toNum(p.cost), 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Cash Position Card ── */}
      <Card className="flex flex-col">
        <CardHeader divided>
          <CardToolbar>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              Cash Position
            </CardTitle>
            <Link href="/gl" className="inline-flex items-center gap-1 text-caption font-medium text-brand-strong hover:underline">
              View GL <ArrowRight className="size-3" />
            </Link>
          </CardToolbar>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-between space-y-4">
          <div className="grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border [&>*]:bg-card [&>*]:flex [&>*]:flex-col [&>*]:justify-center">
            <CashStat
              label="Cash / Bank"
              value={cashPosition.cashBalance}
              tone="default"
            />
            <CashStat
              // Negative AR = customers paid advances, not debt owed to us —
              // show the amount under the advance label, not "-₹48.9K".
              label={cashPosition.arBalance < 0 ? "Advances (from customers)" : "Receivables"}
              value={Math.abs(cashPosition.arBalance)}
              tone={cashPosition.arBalance > 0 ? "warning" : "default"}
            />
            <CashStat
              // Negative AP = supplier advances paid ahead of invoices.
              label={cashPosition.apBalance < 0 ? "Advances (to suppliers)" : "Payables"}
              value={Math.abs(cashPosition.apBalance)}
              tone={cashPosition.apBalance > 0 ? "danger" : "default"}
            />
            <CashStat
              label="Inventory"
              value={cashPosition.inventoryValue}
              tone="default"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-subtle/50 px-3.5 py-2.5">
            <span className="text-body font-medium text-foreground">Net Cash Position</span>
            <span className={`text-figure tnum ${netCash >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(netCash)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Project Profitability Card ── */}
      <Card className="flex flex-col">
        <CardHeader divided>
          <CardToolbar>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              Project Profitability
            </CardTitle>
            <Link href="/finance" className="inline-flex items-center gap-1 text-caption font-medium text-brand-strong hover:underline">
              View Finance <ArrowRight className="size-3" />
            </Link>
          </CardToolbar>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col space-y-3">
          {projectProfits.length === 0 ? (
            <EmptyState size="compact" icon={<BarChart3 />} title="No project profitability data" description="Active projects with financial data will appear here." />
          ) : (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border [&>*]:bg-card [&>*]:p-3">
                <div>
                  <div className="text-label text-muted-foreground">Total Revenue</div>
                  <div className="mt-1 text-body font-semibold tnum text-foreground">{formatCurrency(totalRevenue)}</div>
                  <div className="mt-0.5 text-micro text-muted-foreground">Booked (accrual)</div>
                </div>
                <div>
                  <div className="text-label text-muted-foreground">Cost Booked</div>
                  <div className="mt-1 text-body font-semibold tnum text-foreground">{formatCurrency(totalCost)}</div>
                  <div className="mt-0.5 text-micro text-muted-foreground">Materials + labour + land</div>
                </div>
                <div>
                  {/* Not "Net Profit": revenue is booked on the sale, cost only
                      as work and materials are consumed. A project early in
                      construction legitimately shows a 95%+ margin — calling
                      that net profit invites an owner to bank money that is
                      already spoken for. */}
                  <div className="text-label text-muted-foreground">Gross Profit</div>
                  <div className={`mt-1 text-body font-semibold tnum ${totalProfit >= 0 ? "text-success" : "text-danger"}`}>
                    {formatCurrency(totalProfit)}
                  </div>
                  <div className="mt-0.5 text-micro text-muted-foreground">
                    {overallMargin.toFixed(1)}% gross margin
                  </div>
                </div>
              </div>
              <p className="text-micro text-muted-foreground">
                Cost is recognised as work happens — early-stage projects read high until their full build cost lands.
              </p>

              {/* Per-project rows — top 3 by profit, bottom 3 by loss */}
              <div className="space-y-3">
                {/* Top 3 by profit — only projects with actual revenue */}
                {(() => {
                  const sorted = [...projectProfits]
                    .filter((p) => p.revenue > 0 && p.profit > 0)
                    .sort((a, b) => b.profit - a.profit);
                  const top3 = sorted.slice(0, 3);
                  const bottom3 = [...projectProfits]
                    .filter((p) => p.profit < 0)
                    .sort((a, b) => a.profit - b.profit)
                    .slice(0, 3);
                  return (
                    <>
                      {top3.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-label text-muted-foreground">Top performers</div>
                          <div className="space-y-2">
                            {top3.map((p) => (
                              <ProjectProfitRowItem key={p.id} p={p} />
                            ))}
                          </div>
                        </div>
                      )}
                      {bottom3.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-label text-muted-foreground">Needs attention</div>
                          <div className="space-y-2">
                            {bottom3.map((p) => (
                              <ProjectProfitRowItem key={p.id} p={p} />
                            ))}
                          </div>
                        </div>
                      )}
                      {projectProfits.length > 6 && (
                        <Link
                          href="/finance"
                          className="block pt-1 text-center text-caption font-medium text-brand-strong hover:underline"
                        >
                          View all {projectProfits.length} projects →
                        </Link>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectProfitRowItem({ p }: { p: ProjectProfitRow }) {
  return (
    <Link
      href={`/projects/${p.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 hover:bg-subtle/50 transition-colors"
    >
      <div className="min-w-0">
        <div className="text-body font-medium text-foreground truncate">{p.name}</div>
        <div className="text-caption text-muted-foreground">
          Rev {formatCurrency(p.revenue)} · Cost {formatCurrency(p.cost)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <div className={`text-body font-semibold tnum ${p.profit >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(p.profit)}
          </div>
          <div className="text-caption text-muted-foreground">
            {p.margin.toFixed(1)}% gross
          </div>
        </div>
        {p.profit >= 0 ? (
          <TrendingUp className="h-4 w-4 text-success" />
        ) : (
          <TrendingDown className="h-4 w-4 text-danger" />
        )}
      </div>
    </Link>
  );
}

function CashStat({
  label,
  value,
  tone,
  negate,
}: {
  label: string;
  value: number;
  tone: "default" | "warning" | "danger";
  negate?: boolean;
}) {
  const display = negate ? -value : value;
  const colorClass =
    tone === "danger" ? "text-danger"
    : tone === "warning" ? "text-warning"
    : "text-foreground";
  return (
    <div className="p-3">
      <div className="text-label text-muted-foreground">{label}</div>
      <div className={`mt-1 text-figure tnum ${colorClass}`}>
        {formatCurrency(display)}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet, Building2, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatCurrencyDetailed } from "@/lib/utils";

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
  const totalRevenue = projectProfits.reduce((s, p) => s + p.revenue, 0);
  const totalCost = projectProfits.reduce((s, p) => s + p.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* ── Cash Position Card ── */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-section font-semibold text-foreground">Cash Position</h3>
            <Link href="/gl" className="ml-auto text-caption text-brand hover:underline inline-flex items-center gap-1">
              View GL <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CashStat
              label="Cash / Bank"
              value={cashPosition.cashBalance}
              tone="default"
            />
            <CashStat
              label="Receivables"
              value={cashPosition.arBalance}
              tone={cashPosition.arBalance > 0 ? "warning" : "default"}
            />
            <CashStat
              label="Payables"
              value={cashPosition.apBalance}
              tone={cashPosition.apBalance > 0 ? "danger" : "default"}
              negate
            />
            <CashStat
              label="Inventory"
              value={cashPosition.inventoryValue}
              tone="default"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-body font-medium text-foreground">Net Cash Position</span>
            <span className={`text-body font-semibold tnum ${netCash >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(netCash)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Project Profitability Card ── */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-section font-semibold text-foreground">Project Profitability</h3>
            <Link href="/finance" className="ml-auto text-caption text-brand hover:underline inline-flex items-center gap-1">
              View Finance <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {projectProfits.length === 0 ? (
            <p className="text-caption text-muted-foreground py-4 text-center">
              No active projects with financial data yet.
            </p>
          ) : (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3 border-b border-border pb-3">
                <div>
                  <div className="text-caption text-muted-foreground">Total Revenue</div>
                  <div className="text-body font-semibold tnum text-foreground">{formatCurrency(totalRevenue)}</div>
                </div>
                <div>
                  <div className="text-caption text-muted-foreground">Total Cost</div>
                  <div className="text-body font-semibold tnum text-foreground">{formatCurrency(totalCost)}</div>
                </div>
                <div>
                  <div className="text-caption text-muted-foreground">Net Profit</div>
                  <div className={`text-body font-semibold tnum ${totalProfit >= 0 ? "text-success" : "text-danger"}`}>
                    {formatCurrency(totalProfit)}
                  </div>
                  <div className="text-caption text-muted-foreground">
                    {overallMargin.toFixed(1)}% margin
                  </div>
                </div>
              </div>

              {/* Per-project rows — top 3 by profit, bottom 3 by loss */}
              <div className="space-y-3">
                {/* Top 3 by profit */}
                {(() => {
                  const sorted = [...projectProfits].sort((a, b) => b.profit - a.profit);
                  const top3 = sorted.slice(0, 3);
                  const bottom3 = sorted.filter(p => p.profit < 0).slice(-3).reverse();
                  return (
                    <>
                      {top3.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-caption font-medium text-muted-foreground">Top performers</div>
                          <div className="space-y-2">
                            {top3.map((p) => (
                              <ProjectProfitRowItem key={p.id} p={p} />
                            ))}
                          </div>
                        </div>
                      )}
                      {bottom3.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-caption font-medium text-muted-foreground">Needs attention</div>
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
                          className="block text-center text-caption text-brand hover:underline pt-1"
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
            {p.margin.toFixed(1)}% margin
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

function CashStat({  label,
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
    <div>
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={`text-body font-semibold tnum ${colorClass}`}>
        {formatCurrency(display)}
      </div>
    </div>
  );
}

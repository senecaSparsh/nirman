"use client";

import { useMemo } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { LandPortfolio, LandParcelSummary, LandParcelStatus } from "@/lib/types";

const STATUS_COLOR: Record<LandParcelStatus, string> = {
  AVAILABLE: "var(--color-stage-sell)",
  HOLD: "var(--color-warning)",
  PARTITIONED: "var(--color-muted-foreground)",
  SOLD: "var(--color-danger)",
};

/**
 * Portfolio overview — the land module's signature header.
 *
 * NOT stat tiles. NOT a proportion bar. A dot grid: every parcel as a
 * small colored square, flowing in a grid. Each dot = one parcel,
 * colored by status. This is land-like — plots on a map — and shows
 * both count and status mix at a glance. Below it, inline stats
 * annotate the grid.
 */
export function LandPortfolioStrip({
  portfolio,
  parcels,
}: {
  portfolio: LandPortfolio;
  parcels: LandParcelSummary[];
}) {
  const gainPositive = portfolio.unrealizedGain >= 0;
  const profitPositive = portfolio.soldProfit >= 0;

  // Leaf parcels for the dot grid (skip partitioned parents — their children are the real units)
  const dots = useMemo(() => {
    const leaves = parcels.filter((p) => p.childCount === 0 || p.status !== "PARTITIONED");
    return leaves.length > 0 ? leaves : parcels;
  }, [parcels]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* ── Dot grid — each parcel as a colored square ── */}
      {dots.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {dots.map((p) => (
            <span
              key={p.id}
              className="h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: STATUS_COLOR[p.status], opacity: 0.5 }}
              title={`${p.number} · ${formatNumber(p.area, 0)} · ${p.status}`}
            />
          ))}
        </div>
      ) : (
        <div className="py-2 text-center text-caption text-muted-foreground">
          No parcels recorded
        </div>
      )}

      {/* ── Inline stats — flowing, not tiles ── */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Held</span>
          <span className="tnum text-body font-semibold text-foreground">
            {formatNumber(portfolio.totalArea, 0)}
          </span>
          <span className="text-micro text-muted-foreground">
            {portfolio.purchaseCount} purchase{portfolio.purchaseCount !== 1 ? "s" : ""}
          </span>
        </div>

        <span className="h-3 w-px bg-border" />

        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Unsold</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(portfolio.unsoldValue)}</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Gain</span>
          <span className={`tnum text-body font-semibold ${gainPositive ? "text-success" : "text-danger"}`}>
            {gainPositive ? "+" : ""}{formatCurrency(portfolio.unrealizedGain)}
          </span>
        </div>

        <div className="ml-auto flex items-baseline gap-5">
          {portfolio.soldRevenue > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-label text-muted-foreground/70">Sold</span>
              <span className="tnum text-body font-semibold text-foreground">{formatCurrency(portfolio.soldRevenue)}</span>
              <span className={`tnum text-micro ${profitPositive ? "text-success" : "text-danger"}`}>
                {profitPositive ? "+" : ""}{formatCurrency(portfolio.soldProfit)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

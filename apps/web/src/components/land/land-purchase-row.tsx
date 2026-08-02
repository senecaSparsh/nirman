"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { CadastrePlan } from "./cadastre-plan";
import type { LandPurchaseRow, LandParcelStatus } from "@/lib/types";

const STATUS_COLOR: Record<LandParcelStatus, string> = {
  AVAILABLE: "var(--color-stage-sell)",
  HOLD: "var(--color-warning)",
  PARTITIONED: "var(--color-muted-foreground)",
  SOLD: "var(--color-danger)",
};

/** Status count chips — colored dots with counts, no bar. */
function StatusCounts({ purchase }: { purchase: LandPurchaseRow }) {
  const counts: { status: LandParcelStatus; n: number }[] = [
    { status: "AVAILABLE", n: purchase.availableCount },
    { status: "HOLD", n: purchase.holdCount },
    { status: "PARTITIONED", n: purchase.partitionedCount },
    { status: "SOLD", n: purchase.soldCount },
  ].filter((c) => c.n > 0) as { status: LandParcelStatus; n: number }[];

  if (counts.length === 0) return null;

  return (
    <div className="flex items-center gap-2.5">
      {counts.map((c) => (
        <span key={c.status} className="flex items-center gap-1 text-micro text-muted-foreground tnum">
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: STATUS_COLOR[c.status], opacity: 0.6 }}
          />
          {c.n}
        </span>
      ))}
    </div>
  );
}

export function LandPurchaseRow({
  purchase,
  canEdit,
  onQuickView,
  onEdit,
}: {
  purchase: LandPurchaseRow;
  canEdit: boolean;
  onQuickView: () => void;
  onEdit: () => void;
}) {
  const gainPositive = purchase.valuationGain >= 0;
  const isPartitioned = purchase.partitionedCount > 0 || purchase.hasChildren;
  const allSold = purchase.parcelCount > 0 && purchase.soldCount === purchase.parcelCount;

  return (
    <div
      className="group flex items-center gap-4 rounded-md -mx-2 px-2 py-3 transition-colors hover:bg-muted/30 cursor-pointer"
      onClick={onQuickView}
    >
      {/* Cadastre thumbnail — the signature visual, small */}
      <div className="h-14 w-20 shrink-0 overflow-hidden rounded border border-border/60">
        <CadastrePlan parcels={purchase.parcels} showLabels={false} />
      </div>

      {/* Identity + status counts */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-medium text-foreground">{purchase.sellerName}</span>
          {isPartitioned && (
            <Layers className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {allSold && <Badge variant="danger" className="shrink-0">Sold out</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-caption text-muted-foreground">
          <span className="truncate">{purchase.projectName ?? "Standalone land"}</span>
          {purchase.location && (
            <span className="flex items-center gap-0.5 truncate">
              <MapPin className="h-2.5 w-2.5" />{purchase.location}
            </span>
          )}
          <span className="tnum">{formatDate(purchase.purchaseDate)}</span>
        </div>
        {/* Status counts — colored dots with numbers, no bar */}
        {purchase.parcelCount > 0 && (
          <div className="mt-1.5">
            <StatusCounts purchase={purchase} />
          </div>
        )}
      </div>

      {/* Hero number — unrealized gain */}
      <div className="shrink-0 text-right">
        <div className={`tnum text-body font-semibold ${gainPositive ? "text-success" : "text-danger"}`}>
          {gainPositive ? "+" : ""}{formatCurrency(purchase.valuationGain)}
        </div>
        <div className="text-micro text-muted-foreground tnum">
          {formatCurrency(purchase.unsoldValue)} held
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-muted-foreground"
          >
            Edit
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
          <Link href={`/land/${purchase.id}`}>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

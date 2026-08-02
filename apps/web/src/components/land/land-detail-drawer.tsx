"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, ArrowRight, MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { CadastrePlan, CadastreLegend } from "./cadastre-plan";
import type { LandPurchaseRow, LandParcelStatus } from "@/lib/types";

const PARCEL_STATUS_VARIANT: Record<LandParcelStatus, "default" | "success" | "warning" | "muted" | "danger"> = {
  AVAILABLE: "success",
  HOLD: "warning",
  PARTITIONED: "muted",
  SOLD: "danger",
};

/**
 * Quick-view slide-over for a land purchase.
 * Cadastre plan at the top (the signature visual), then inline stats
 * (label + tnum, no tiles), then the parcel breakdown table.
 */
export function LandDetailDrawer({
  purchase,
  onClose,
}: {
  purchase: LandPurchaseRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!purchase) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [purchase, onClose]);

  if (!purchase) return null;

  const gainPositive = purchase.valuationGain >= 0;
  const costPerUnit = purchase.totalArea > 0 ? purchase.totalCost / purchase.totalArea : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] drawer-backdrop" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-card shadow-2xl drawer-panel">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-title font-bold text-foreground truncate">{purchase.sellerName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
              <span>{purchase.projectName ?? "Standalone land"}</span>
              {purchase.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{purchase.location}</span>}
              <span className="tnum">{formatDate(purchase.purchaseDate)}</span>
              {purchase.registryNo && (
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{purchase.registryNo}</span>
              )}
            </div>
          </div>
          <button
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Cadastre plan — the signature visual */}
          {purchase.parcels.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-label text-muted-foreground/70">Plan View</span>
                <CadastreLegend />
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-2">
                <CadastrePlan parcels={purchase.parcels} />
              </div>
            </div>
          )}

          {/* Inline stats — label + tnum, no tiles */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
              <span className="text-label text-muted-foreground/70">Total Area</span>
              <span className="tnum text-body font-semibold text-foreground">
                {formatNumber(purchase.totalArea, 0)} {purchase.areaUnit}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
              <span className="text-label text-muted-foreground/70">Cost Basis</span>
              <span className="tnum text-body font-semibold text-foreground">
                {formatCurrency(purchase.totalCost)}
                <span className="ml-1.5 text-micro text-muted-foreground">
                  {formatCurrency(costPerUnit)}/{purchase.areaUnit}
                </span>
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
              <span className="text-label text-muted-foreground/70">Unsold Value</span>
              <span className="tnum text-body font-semibold text-foreground">{formatCurrency(purchase.unsoldValue)}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
              <span className="text-label text-muted-foreground/70">Unrealized Gain</span>
              <span className={`tnum text-body font-semibold ${gainPositive ? "text-success" : "text-danger"}`}>
                {gainPositive ? "+" : ""}{formatCurrency(purchase.valuationGain)}
              </span>
            </div>
            {purchase.soldRevenue > 0 && (
              <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
                <span className="text-label text-muted-foreground/70">Sold Revenue</span>
                <span className="tnum text-body font-semibold text-foreground">
                  {formatCurrency(purchase.soldRevenue)}
                  <span className="ml-1.5 text-micro text-muted-foreground">
                    {purchase.soldCount} sold
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Parcel breakdown */}
          <div>
            <div className="mb-2 text-label text-muted-foreground/70">Parcels</div>
            {purchase.parcels.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-caption text-muted-foreground">
                No parcels under this purchase.
              </p>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Parcel</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Area</TH>
                      <TH className="text-right">Cost</TH>
                      <TH className="text-right">Valuation</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {purchase.parcels.map((p) => (
                      <TR key={p.id}>
                        <TD className="font-mono text-caption font-medium">{p.number}</TD>
                        <TD><Badge variant={PARCEL_STATUS_VARIANT[p.status]}>{p.status}</Badge></TD>
                        <TD className="tnum text-right">{formatNumber(p.area, 0)}</TD>
                        <TD className="tnum text-right">{formatCurrency(p.acquisitionCost)}</TD>
                        <TD className="tnum text-right">{formatCurrency(p.currentValuation)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="border-t border-border p-3">
          <Button asChild className="w-full">
            <Link href={`/land/${purchase.id}`}>
              Open full management view <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, AlertTriangle, Home, Building2, Layers, Maximize2, ArrowRight, Hammer, Pause } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import type { BuiltUnitRow, BuiltUnitStatus, BuiltUnitType } from "@/lib/types";

const STATUS_LABELS: Record<BuiltUnitStatus, string> = {
  PLANNED: "Planned",
  UNDER_CONSTRUCTION: "Construction",
  AVAILABLE: "Available",
  HOLD: "Hold",
  SOLD: "Sold",
};

const STATUS_COLORS: Record<BuiltUnitStatus, string> = {
  PLANNED: "var(--color-muted-foreground)",
  UNDER_CONSTRUCTION: "var(--color-warning)",
  AVAILABLE: "var(--color-stage-sell)",
  HOLD: "var(--color-stage-manage)",
  SOLD: "var(--color-danger)",
};

const STATUS_VARIANT: Record<BuiltUnitStatus, "default" | "success" | "warning" | "muted" | "danger"> = {
  PLANNED: "muted",
  UNDER_CONSTRUCTION: "warning",
  AVAILABLE: "success",
  HOLD: "default",
  SOLD: "danger",
};

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
  SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse", OTHER: "Other",
};

const VALID_TRANSITIONS: Record<BuiltUnitStatus, BuiltUnitStatus[]> = {
  PLANNED: ["UNDER_CONSTRUCTION"],
  UNDER_CONSTRUCTION: ["AVAILABLE", "PLANNED"],
  AVAILABLE: ["HOLD", "UNDER_CONSTRUCTION"],
  HOLD: ["AVAILABLE"],
  SOLD: [],
};

const TRANSITION_BUTTON_CONFIG: Record<BuiltUnitStatus, { icon: typeof Hammer; title: string }> = {
  PLANNED: { icon: ArrowRight, title: "Revert to Planned" },
  UNDER_CONSTRUCTION: { icon: Hammer, title: "Start Construction" },
  AVAILABLE: { icon: ArrowRight, title: "Mark Available" },
  HOLD: { icon: Pause, title: "Put on Hold" },
  SOLD: { icon: ArrowRight, title: "Sold" },
};

export function UnitValuationDialog({
  open,
  onOpenChange,
  unit,
  canEdit = true,
  onValuationUpdated,
  onStatusChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: BuiltUnitRow | null;
  canEdit?: boolean;
  /** Called after a successful valuation update with the new values, for optimistic UI. */
  onValuationUpdated?: (unitId: string, updates: { askingPrice: number | null; currentValuation: number }) => void;
  /** Called after a successful status change, for optimistic UI. */
  onStatusChanged?: (unitId: string, newStatus: BuiltUnitStatus) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [askingPrice, setAskingPrice] = useState("");
  const [currentValuation, setCurrentValuation] = useState("");

  useEffect(() => {
    if (open && unit) {
      setAskingPrice(unit.askingPrice ? String(unit.askingPrice) : "");
      setCurrentValuation(String(unit.currentValuation));
    }
  }, [open, unit]);

  // Live preview of margin based on the edited asking price
  const previewAsking = askingPrice ? Number(askingPrice) : null;
  const previewMargin = useMemo(() => {
    if (!unit || previewAsking == null) return null;
    return previewAsking - unit.productionCost;
  }, [unit, previewAsking]);

  const previewMarginPct = previewMargin != null && unit && unit.productionCost > 0
    ? (previewMargin / unit.productionCost) * 100
    : null;

  const previewPricePerSqft = previewAsking != null && unit && unit.area > 0
    ? previewAsking / unit.area
    : null;

  // NRV check: if currentValuation < productionCost, there's a write-down
  const previewValuation = currentValuation ? Number(currentValuation) : 0;
  const previewNRVWriteDown = unit != null && previewValuation > 0 && previewValuation < unit.productionCost
    ? unit.productionCost - previewValuation
    : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unit) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { action: "valuation" };
      const newAsking = askingPrice ? Number(askingPrice) : null;
      const newValuation = currentValuation ? Number(currentValuation) : unit.currentValuation;
      if (askingPrice) body.askingPrice = Number(askingPrice);
      else body.askingPrice = null;
      if (currentValuation) body.currentValuation = Number(currentValuation);

      const res = await fetch(`/api/built-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update valuation");
      toast.success("Valuation updated");
      // Optimistic callback before closing
      onValuationUpdated?.(unit.id, { askingPrice: newAsking, currentValuation: newValuation });
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(newStatus: BuiltUnitStatus) {
    if (!unit) return;
    setChangingStatus(true);
    try {
      const res = await fetch(`/api/built-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status change failed");
      toast.success(`Marked as ${STATUS_LABELS[newStatus]}`);
      // Optimistic callback before closing
      onStatusChanged?.(unit.id, newStatus);
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setChangingStatus(false);
    }
  }

  if (!unit) return null;

  const existingMargin = unit.askingPrice != null ? unit.askingPrice - unit.productionCost : null;
  const existingMarginPct = existingMargin != null && unit.productionCost > 0
    ? (existingMargin / unit.productionCost) * 100
    : null;
  const existingPricePerSqft = unit.askingPrice != null && unit.area > 0
    ? unit.askingPrice / unit.area
    : null;
  const currentPricePerSqft = unit.currentValuation > 0 && unit.area > 0
    ? unit.currentValuation / unit.area
    : null;
  const transitions = VALID_TRANSITIONS[unit.status] ?? [];
  const isSold = unit.status === "SOLD";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={unit.unitNumber}
      className="max-w-lg"
    >
      {/* ── Unit identity header ── */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklch, ${STATUS_COLORS[unit.status]} 12%, transparent)` }}
        >
          <Home className="h-5 w-5" style={{ color: STATUS_COLORS[unit.status] }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body font-bold text-foreground">{UNIT_TYPE_LABELS[unit.unitType]}</span>
            <Badge variant={STATUS_VARIANT[unit.status]} className="text-micro">{STATUS_LABELS[unit.status]}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{unit.projectName}</span>
            {unit.phaseName && <span>{unit.phaseName}</span>}
            {unit.floor != null && <span className="flex items-center gap-1"><Layers className="h-3 w-3" />Floor {unit.floor}</span>}
            {unit.wing && <span>Wing {unit.wing}</span>}
            <span className="flex items-center gap-1"><Maximize2 className="h-3 w-3" />{formatNumber(unit.area, 0)} {unit.areaUnit}</span>
          </div>
        </div>
      </div>

      {/* ── Status transitions ── */}
      {canEdit && transitions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-label text-muted-foreground/70">Move to:</span>
          {transitions.map((s) => {
            const cfg = TRANSITION_BUTTON_CONFIG[s];
            const Icon = cfg.icon;
            return (
              <Button
                key={s}
                variant="outline"
                size="sm"
                disabled={changingStatus}
                onClick={() => changeStatus(s)}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {STATUS_LABELS[s]}
              </Button>
            );
          })}
        </div>
      )}
      {isSold && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
          <span className="text-caption text-muted-foreground">Sold — managed via Sales module</span>
          {unit.saleId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { window.location.href = `/sales`; }}
              title="View sale"
            >
              View sale <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* ── Financial summary — current state ── */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <SummaryCell label="Production Cost" value={formatCurrency(unit.productionCost)} />
        <SummaryCell label="Current Valuation" value={formatCurrency(unit.currentValuation)} />
        <SummaryCell
          label="Asking Price"
          value={unit.askingPrice ? formatCurrency(unit.askingPrice) : "—"}
          accent={unit.askingPrice ? "foreground" : "muted"}
        />
        <SummaryCell
          label="Price / Sqft"
          value={existingPricePerSqft != null ? `${formatNumber(existingPricePerSqft, 0)} ₹` : "—"}
        />
        {existingMargin != null && unit.productionCost > 0 && (
          <SummaryCell
            label="Margin"
            value={`${existingMargin >= 0 ? "+" : ""}${formatCurrency(existingMargin)}`}
            sub={existingMarginPct != null ? `${existingMarginPct.toFixed(1)}%` : undefined}
            accent={existingMargin >= 0 ? "success" : "danger"}
          />
        )}
        {currentPricePerSqft != null && (
          <SummaryCell
            label="Valuation / Sqft"
            value={`${formatNumber(currentPricePerSqft, 0)} ₹`}
          />
        )}
        {unit.nrvWriteDown > 0 && (
          <SummaryCell
            label="NRV Write-down"
            value={formatCurrency(unit.nrvWriteDown)}
            accent="danger"
            icon={<TrendingDown className="h-3 w-3" />}
          />
        )}
      </div>

      {/* ── Editable fields ── */}
      {canEdit && !isSold && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="uv-asking">Asking Price</Label>
              <Input
                id="uv-asking"
                type="number"
                step="0.01"
                min="0"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="Leave empty to clear"
              />
              {/* Live preview row */}
              {previewMargin != null && unit.productionCost > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
                  <span className={cn("flex items-center gap-1", previewMargin >= 0 ? "text-success" : "text-danger")}>
                    {previewMargin >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {previewMargin >= 0 ? "Profit" : "Loss"} {previewMargin >= 0 ? "+" : ""}{formatCurrency(previewMargin)}
                    {previewMarginPct != null && <span className="opacity-70">({previewMarginPct.toFixed(1)}%)</span>}
                  </span>
                  {previewPricePerSqft != null && (
                    <span className="text-muted-foreground">
                      {formatNumber(previewPricePerSqft, 0)} ₹/{unit.areaUnit.toLowerCase()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="uv-valuation">Current Valuation</Label>
              <Input
                id="uv-valuation"
                type="number"
                step="0.01"
                min="0"
                value={currentValuation}
                onChange={(e) => setCurrentValuation(e.target.value)}
                placeholder="0"
              />
              {previewNRVWriteDown > 0 && (
                <div className="flex items-center gap-1.5 text-caption text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Valuation below cost — NRV write-down of {formatCurrency(previewNRVWriteDown)}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Update Valuation"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// ── Summary cell — compact stat in the grid ──
function SummaryCell({
  label, value, sub, accent, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "success" | "danger" | "foreground" | "muted";
  icon?: React.ReactNode;
}) {
  const color =
    accent === "success" ? "text-success" :
    accent === "danger" ? "text-danger" :
    accent === "muted" ? "text-muted-foreground/50" :
    "text-foreground";
  return (
    <div className="bg-card p-2.5">
      <div className="flex items-center gap-1 text-label text-muted-foreground/70">
        {icon}
        {label}
      </div>
      <div className={cn("mt-0.5 tnum text-body font-semibold", color)}>
        {value}
      </div>
      {sub && <div className={cn("text-micro tnum", color, "opacity-70")}>{sub}</div>}
    </div>
  );
}

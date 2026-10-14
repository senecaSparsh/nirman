"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, AlertTriangle, Home, Building2, Layers, Maximize2, ArrowRight, Hammer, Pause, CircleDollarSign, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusPill, statusColor } from "@/components/page";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import type { BuiltUnitRow, BuiltUnitStatus, BuiltUnitType } from "@/lib/types";

const STATUS_LABELS: Record<BuiltUnitStatus, string> = {
  PLANNED: "Planned",
  UNDER_CONSTRUCTION: "Construction",
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  HOLD: "Hold",
  SOLD: "Sold",
  RENTED: "Rented",
};

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
  SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse", VILLA: "Villa", OTHER: "Other",
};

// Keep in sync with the server table in packages/services/src/built-unit.ts
// (updateUnitStatus). RESERVED and SOLD are driven by the sales flow —
// a deposit reserves the unit and completing the sale sells it — so they're
// never offered as manual transitions here.
const VALID_TRANSITIONS: Record<BuiltUnitStatus, BuiltUnitStatus[]> = {
  PLANNED: ["UNDER_CONSTRUCTION"],
  UNDER_CONSTRUCTION: ["AVAILABLE", "PLANNED"],
  AVAILABLE: ["HOLD", "UNDER_CONSTRUCTION"],
  RESERVED: [],
  HOLD: ["AVAILABLE"],
  SOLD: [],
  RENTED: [],
};

const TRANSITION_BUTTON_CONFIG: Record<BuiltUnitStatus, { icon: typeof Hammer; title: string }> = {
  PLANNED: { icon: ArrowRight, title: "Revert to Planned" },
  UNDER_CONSTRUCTION: { icon: Hammer, title: "Start Construction" },
  AVAILABLE: { icon: ArrowRight, title: "Mark Available" },
  RESERVED: { icon: CircleDollarSign, title: "Reserved" },
  HOLD: { icon: Pause, title: "Put on Hold" },
  SOLD: { icon: ArrowRight, title: "Sold" },
  RENTED: { icon: ArrowRight, title: "Rented" },
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askingPrice, setAskingPrice] = useState("");
  const [currentValuation, setCurrentValuation] = useState("");

  useEffect(() => {
    if (open && unit) {
      setAskingPrice(unit.askingPrice ? String(unit.askingPrice) : "");
      setCurrentValuation(String(unit.currentValuation));
      setConfirmDelete(false);
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
      toast.success("Valuation updated", {
        description: unit.status === "AVAILABLE" ? "This unit is available for sale." : undefined,
        action: unit.status === "AVAILABLE" ? {
          label: "Sell This Unit",
          onClick: () => router.push(`/units?unit=${unit.id}&action=sell`),
        } : undefined,
      });
      // Optimistic callback before closing
      onValuationUpdated?.(unit.id, { askingPrice: newAsking, currentValuation: newValuation });
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
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
      toast.success(`Marked as ${STATUS_LABELS[newStatus]}`, {
        description: newStatus === "AVAILABLE" ? "Set an asking price and sell this unit." : undefined,
        action: newStatus === "AVAILABLE" ? {
          label: "Set Asking Price",
          onClick: () => router.push(`/units?unit=${unit.id}&action=valuate`),
        } : undefined,
      });
      // Optimistic callback before closing
      onStatusChanged?.(unit.id, newStatus);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setChangingStatus(false);
    }
  }

  async function deleteUnit() {
    if (!unit) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/built-units/${unit.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(`Unit ${unit.unitNumber} deleted`);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
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
  const isReserved = unit.status === "RESERVED";
  const isRented = unit.status === "RENTED";

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
          style={{ backgroundColor: `color-mix(in oklch, ${statusColor(unit.status)} 12%, transparent)` }}
        >
          <Home className="h-5 w-5" style={{ color: statusColor(unit.status) }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body font-bold text-foreground">{UNIT_TYPE_LABELS[unit.unitType]}</span>
            <StatusPill status={unit.status} />
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
      {isReserved && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
          <span className="text-caption text-muted-foreground">Reserved — a sale is in progress; manage or cancel it via Sales</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { window.location.href = `/sales`; }}
            title="View sales"
          >
            View sales <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}
      {isRented && (
        <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <span className="text-caption text-muted-foreground">Rented — managed via lease/rental records</span>
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
          label="Price / Sq.Ft"
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
            label="Valuation / Sq.Ft"
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

          <div className="flex items-center justify-between gap-2 pt-1">
            {unit.status === "PLANNED" ? (
              confirmDelete ? (
                <span className="flex items-center gap-2 text-caption">
                  <span className="text-danger font-medium">Delete this unit?</span>
                  <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={deleteUnit}>
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 text-caption text-muted-foreground hover:text-danger transition-colors"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete unit…
                </button>
              )
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Update Valuation"}
              </Button>
            </span>
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

"use client";

import { useState, useMemo } from "react";
import { Search, AlertTriangle, TrendingDown } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export type ReconItem = {
  materialId: string | null;
  materialName: string;
  unit: string;
  requiredQty: number;
  issuedQty: number;
  consumedQty: number;
  consumptionVariance: number;
  wastagePct: number;
  tolerancePct: number;
  isOverTolerance: boolean;
  alertLevel: "OK" | "WARNING" | "CRITICAL";
};

type FilterMode = "ALL" | "OVER_TOLERANCE" | "WARNING" | "OK";

const FILTER_OPTIONS: { label: string; value: FilterMode }[] = [
  { label: "All", value: "ALL" },
  { label: "Over tolerance", value: "OVER_TOLERANCE" },
  { label: "Warning", value: "WARNING" },
  { label: "OK", value: "OK" },
];

export function MobileReconList({
  items,
  overToleranceCount,
}: {
  items: ReconItem[];
  overToleranceCount: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "OVER_TOLERANCE") result = result.filter((i) => i.isOverTolerance);
    else if (filter === "WARNING") result = result.filter((i) => i.alertLevel === "WARNING");
    else if (filter === "OK") result = result.filter((i) => i.alertLevel === "OK" && !i.isOverTolerance);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((i) => i.materialName.toLowerCase().includes(q));
    }
    return result;
  }, [items, filter, query]);

  return (
    <div>
      {/* Search + filter */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex-1 flex items-center gap-1.5 rounded-[0.5rem] border px-2.5 py-1.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Search className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search materials…"
            className="flex-1 bg-transparent text-m-caption outline-none"
            style={{ color: "var(--color-ink-950)" }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.value;
          const count =
            opt.value === "OVER_TOLERANCE" ? overToleranceCount :
            opt.value === "ALL" ? items.length :
            items.filter((i) =>
              opt.value === "WARNING" ? i.alertLevel === "WARNING" :
              opt.value === "OK" ? i.alertLevel === "OK" && !i.isOverTolerance :
              true
            ).length;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className="shrink-0 rounded-full px-2.5 py-1 text-m-caption font-semibold press"
              style={{
                backgroundColor: isActive ? "var(--color-ink-950)" : "var(--color-paper)",
                color: isActive ? "var(--color-paper)" : "var(--color-ink-500)",
                border: `1px solid ${isActive ? "var(--color-ink-950)" : "var(--color-line)"}`,
              }}
            >
              {opt.label} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-500)" }}>
            No materials match this filter
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <ReconCard key={item.materialId ?? item.materialName} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReconCard({ item }: { item: ReconItem }) {
  const varianceColor = item.isOverTolerance
    ? "var(--color-stop)"
    : "var(--color-go)";

  const wastageColor = item.isOverTolerance
    ? "var(--color-stop)"
    : Math.abs(item.wastagePct) > 0
      ? "var(--color-signal-dark)"
      : "var(--color-ink-500)";

  return (
    <div
      className="rounded-[0.625rem] border p-2.5"
      style={{
        borderColor: item.isOverTolerance
          ? "var(--color-stop)"
          : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Header: name + wastage badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-m-section font-bold leading-tight truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {item.materialName}
          </p>
          <p
            className="text-m-caption mt-0.5"
            style={{ color: "var(--color-ink-500)" }}
          >
            {item.unit}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 justify-end">
            {item.isOverTolerance && (
              <TrendingDown
                className="size-3"
                style={{ color: "var(--color-stop)" }}
              />
            )}
            <p
              className="text-m-body font-bold tabular-nums"
              style={{ color: wastageColor }}
            >
              {item.wastagePct > 0 ? "+" : ""}
              {formatNumber(item.wastagePct, 1)}%
            </p>
          </div>
          <p
            className="text-m-caption mt-0.5"
            style={{ color: "var(--color-ink-500)" }}
          >
            wastage
          </p>
        </div>
      </div>

      {/* Qty grid: required / issued / consumed */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <QtyCell label="Required" value={formatNumber(item.requiredQty, 2)} />
        <QtyCell label="Issued" value={formatNumber(item.issuedQty, 2)} />
        <QtyCell label="Consumed" value={formatNumber(item.consumedQty, 2)} />
      </div>

      {/* Variance footer */}
      <div
        className="flex items-center justify-between pt-2 border-t"
        style={{ borderColor: "var(--color-line)" }}
      >
        <p
          className="text-m-caption font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-ink-500)" }}
        >
          Consumption variance
        </p>
        <p
          className="text-m-body font-bold tabular-nums"
          style={{ color: varianceColor }}
        >
          {item.consumptionVariance > 0 ? "+" : ""}
          {formatNumber(item.consumptionVariance, 2)} {item.unit}
        </p>
      </div>

      {/* Tolerance hint */}
      <p
        className="text-m-caption mt-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        Tolerance: ±{formatNumber(item.tolerancePct, 0)}% ·{" "}
        {item.isOverTolerance ? "Over tolerance" : "Within tolerance"}
      </p>
    </div>
  );
}

function QtyCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[0.375rem] px-1.5 py-1"
      style={{ backgroundColor: "var(--color-concrete)" }}
    >
      <p
        className="text-m-caption font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
      </p>
      <p
        className="text-m-body font-bold tabular-nums leading-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {value}
      </p>
    </div>
  );
}

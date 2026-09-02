"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Building2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, cn } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

export type ProjectOption = { id: string; name: string };

type ProfitCenter = {
  totalRevenue: number;
  costRecovery: number;
  totalInflow: number;
  landCost: number;
  materialCost: number;
  labourCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  overheadCost: number;
  totalCost: number;
  grossProfit: number;
  marginPct: number;
  totalSellableArea: number;
  costPerSqft: number;
  revenuePerSqft: number;
};

const COST_ROWS: { label: string; key: keyof ProfitCenter }[] = [
  { label: "Land", key: "landCost" },
  { label: "Materials", key: "materialCost" },
  { label: "Labour", key: "labourCost" },
  { label: "Equipment", key: "equipmentCost" },
  { label: "Subcontractor", key: "subcontractorCost" },
  { label: "Overhead", key: "overheadCost" },
];

export function MobileProfitCenterClient({ projects }: { projects: ProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pc, setPc] = useState<ProfitCenter | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/profit-center?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setPc)
      .catch(() => toast.error("Failed to load profit center"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const selectedProject = projects.find((p) => p.id === projectId);

  if (projects.length === 0) {
    return (
      <MobileEmptyState
        icon={Wallet}
        title="No projects"
        hint="Create a project to see its profit center."
      />
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* ── Header with project picker ── */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-m-section font-bold flex items-center gap-2" style={{ color: "var(--color-ink-950)" }}>
            <Wallet className="size-4" style={{ color: "var(--color-steel)" }} />
            Profit Center
          </h1>
        </div>
        {/* Project selector */}
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-full flex items-center justify-between h-11 rounded-[0.5rem] border px-3 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <span className="text-m-section font-medium truncate" style={{ color: "var(--color-ink-950)" }}>
            {selectedProject?.name ?? "Select project…"}
          </span>
          <ChevronDown
            className={cn("size-4 transition-transform", pickerOpen && "rotate-180")}
            style={{ color: "var(--color-ink-500)" }}
          />
        </button>
        {pickerOpen && (
          <div
            className="mt-1 rounded-[0.5rem] border max-h-60 overflow-y-auto"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setProjectId(p.id); setPickerOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-m-section hover:bg-[var(--color-paper-2)] press"
                style={{
                  color: p.id === projectId ? "var(--color-steel)" : "var(--color-ink-950)",
                  fontWeight: p.id === projectId ? 600 : 400,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-steel)" }} />
        </div>
      ) : pc ? (
        <div className="p-3 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-1.5">
            <SummaryCard
              label="Total Revenue"
              value={formatCurrencyCompact(pc.totalRevenue)}
              sub={`+ ${formatCurrencyCompact(pc.costRecovery)} recovery`}
              icon={<TrendingUp className="size-3.5" style={{ color: "var(--color-go)" }} />}
            />
            <SummaryCard
              label="Total Cost"
              value={formatCurrencyCompact(pc.totalCost)}
              sub={`${formatCurrencyCompact(pc.costPerSqft)}/sqft`}
              icon={<TrendingDown className="size-3.5" style={{ color: "var(--color-danger, #ef4444)" }} />}
            />
            <SummaryCard
              label="Gross Profit"
              value={formatCurrencyCompact(pc.grossProfit)}
              sub={`Margin: ${pc.marginPct.toFixed(1)}%`}
              icon={<Wallet className={cn("size-3.5", pc.grossProfit >= 0 ? "" : "")} style={{ color: pc.grossProfit >= 0 ? "var(--color-go)" : "var(--color-danger, #ef4444)" }} />}
              highlight={pc.grossProfit >= 0 ? "positive" : "negative"}
            />
            <SummaryCard
              label="Revenue/sqft"
              value={formatCurrencyCompact(pc.revenuePerSqft)}
              sub={`${pc.totalSellableArea.toFixed(0)} sqft sellable`}
              icon={<Building2 className="size-3.5" style={{ color: "var(--color-ink-400)" }} />}
            />
          </div>

          {/* Cost breakdown */}
          <div>
            <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>
              Cost Breakdown
            </p>
            <div className="rounded-[0.625rem] border overflow-hidden" style={{ borderColor: "var(--color-line)" }}>
              {COST_ROWS.map((row, i) => {
                const amount = pc[row.key] as number;
                const pct = pc.totalCost > 0 ? (amount / pc.totalCost) * 100 : 0;
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between px-3 py-2.5"
                    style={{
                      borderBottom: i < COST_ROWS.length - 1 ? "1px solid var(--color-line)" : "none",
                      backgroundColor: "var(--color-paper)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-m-body font-medium" style={{ color: "var(--color-ink-950)" }}>
                        {row.label}
                      </span>
                      <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-m-body font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                      {formatCurrency(amount)}
                    </span>
                  </div>
                );
              })}
              {/* Total row */}
              <div
                className="flex items-center justify-between px-3 py-3"
                style={{ backgroundColor: "var(--color-paper-2)", borderTop: "2px solid var(--color-line)" }}
              >
                <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Total Cost
                </span>
                <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(pc.totalCost)}
                </span>
              </div>
            </div>
          </div>

          {/* Profit summary bar */}
          <div
            className="rounded-[0.625rem] border p-3"
            style={{
              borderColor: pc.grossProfit >= 0 ? "color-mix(in srgb, var(--color-go) 30%, transparent)" : "color-mix(in srgb, var(--color-danger, #ef4444) 30%, transparent)",
              backgroundColor: pc.grossProfit >= 0 ? "color-mix(in srgb, var(--color-go) 5%, transparent)" : "color-mix(in srgb, var(--color-danger, #ef4444) 5%, transparent)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                Revenue − Cost = Profit
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(pc.totalRevenue)}
              </span>
              <span className="text-m-section" style={{ color: "var(--color-ink-400)" }}>−</span>
              <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(pc.totalCost)}
              </span>
              <span className="text-m-section" style={{ color: "var(--color-ink-400)" }}>=</span>
              <span
                className="text-m-section font-bold tabular-nums"
                style={{ color: pc.grossProfit >= 0 ? "var(--color-go)" : "var(--color-danger, #ef4444)" }}
              >
                {formatCurrencyCompact(pc.grossProfit)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <MobileEmptyState
          icon={Wallet}
          title="No data available"
          hint="No profit center data for this project yet."
        />
      )}
    </div>
  );
}

/* ─── Summary card ─── */
function SummaryCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  highlight?: "positive" | "negative";
}) {
  const borderColor =
    highlight === "positive"
      ? "color-mix(in srgb, var(--color-go) 30%, transparent)"
      : highlight === "negative"
        ? "color-mix(in srgb, var(--color-danger, #ef4444) 30%, transparent)"
        : "var(--color-line)";

  return (
    <div
      className="rounded-[0.625rem] border p-3 space-y-1"
      style={{ borderColor, backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
          {label}
        </span>
        {icon}
      </div>
      <div
        className="text-m-section font-bold tabular-nums"
        style={{
          color:
            highlight === "positive"
              ? "var(--color-go)"
              : highlight === "negative"
                ? "var(--color-danger, #ef4444)"
                : "var(--color-ink-950)",
        }}
      >
        {value}
      </div>
      <div className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
        {sub}
      </div>
    </div>
  );
}

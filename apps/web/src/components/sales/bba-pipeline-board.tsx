"use client";

import { useMemo, useState } from "react";
import {
  ShoppingCart, FileText, Wallet, Scale, CheckCircle2,
  AlertCircle, Phone, Building2, TrendingUp, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { AssetSaleRow } from "@/lib/types";

// ════════════════════════════════════════════════════════════════
//  BBA Pipeline — derived sale stage
// ════════════════════════════════════════════════════════════════

export type BbaStage =
  | "BOOKED"          // deposit received, BBA not yet signed
  | "BBA_SIGNED"      // BBA signed, payments not started / pending
  | "PAYMENTS_PROGRESS" // partial payments, BBA signed
  | "REGISTRY_PENDING"  // fully paid, registry not done
  | "COMPLETED"       // sale deed registered
  | "CANCELLED";      // cancelled

export function deriveBbaStage(s: AssetSaleRow): BbaStage {
  if (s.status === "CANCELLED" || s.saleStage === "CANCELLED") return "CANCELLED";
  if (s.saleStage === "COMPLETED" || s.saleDeedNo) return "COMPLETED";
  if (s.paymentStatus === "PAID" && !s.saleDeedNo) return "REGISTRY_PENDING";
  if (s.paymentStatus === "PARTIAL" && s.bbaNo) return "PAYMENTS_PROGRESS";
  if (s.bbaNo) return "BBA_SIGNED";
  return "BOOKED";
}

const STAGE_CONFIG: Record<
  BbaStage,
  {
    label: string;
    color: string;
    icon: typeof FileText;
    description: string;
  }
> = {
  BOOKED: {
    label: "Booked",
    color: "var(--color-stage-system, #64748b)",
    icon: ShoppingCart,
    description: "Deposit received · BBA pending",
  },
  BBA_SIGNED: {
    label: "BBA Signed",
    color: "var(--color-stage-manage, #3b82f6)",
    icon: FileText,
    description: "Agreement signed · Payments starting",
  },
  PAYMENTS_PROGRESS: {
    label: "Payments",
    color: "var(--color-stage-procure, #06b6d4)",
    icon: Wallet,
    description: "Slab-linked payments in progress",
  },
  REGISTRY_PENDING: {
    label: "Registry",
    color: "var(--color-stage-sell, #22c55e)",
    icon: Scale,
    description: "Fully paid · Registry pending",
  },
  COMPLETED: {
    label: "Completed",
    color: "var(--color-go, #16a34a)",
    icon: CheckCircle2,
    description: "Sale deed registered",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "var(--color-danger, #ef4444)",
    icon: AlertCircle,
    description: "Sale cancelled",
  },
};

const STAGE_ORDER: BbaStage[] = [
  "BOOKED",
  "BBA_SIGNED",
  "PAYMENTS_PROGRESS",
  "REGISTRY_PENDING",
  "COMPLETED",
];

// ════════════════════════════════════════════════════════════════
//  Main component
// ════════════════════════════════════════════════════════════════

export function BbaPipelineBoard({
  sales,
  projects,
  onSelectSale,
  onSendReminders,
}: {
  sales: AssetSaleRow[];
  projects: { id: string; name: string }[];
  onSelectSale: (sale: AssetSaleRow) => void;
  onSendReminders?: () => void;
}) {
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (s.status === "CANCELLED") return false;
      if (projectFilter && s.projectId !== projectFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          s.customerName.toLowerCase().includes(q) ||
          s.builtUnitNumber?.toLowerCase().includes(q) ||
          s.landParcelNumber?.toLowerCase().includes(q) ||
          s.saleNumber.toLowerCase().includes(q) ||
          s.projectName?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [sales, projectFilter, search]);

  // Group by derived stage
  const columns = useMemo(() => {
    return STAGE_ORDER.map((stage) => ({
      stage,
      ...STAGE_CONFIG[stage],
      items: filtered.filter((s) => deriveBbaStage(s) === stage),
    }));
  }, [filtered]);

  // Summary stats
  const stats = useMemo(() => {
    const totalRevenue = filtered.reduce((s, x) => s + x.salePrice + x.gstAmount, 0);
    const totalCollected = filtered.reduce((s, x) => s + x.totalPaid, 0);
    const totalOutstanding = filtered.reduce((s, x) => s + x.balanceDue, 0);
    const bbaDone = filtered.filter((s) => s.bbaNo).length;
    const bbaPending = filtered.filter((s) => !s.bbaNo).length;
    const overduePayments = filtered.filter(
      (s) => s.balanceDue > 0 && s.paymentSchedule?.items.some((i) => i.status === "DUE"),
    ).length;
    return {
      total: filtered.length,
      totalRevenue,
      totalCollected,
      totalOutstanding,
      bbaDone,
      bbaPending,
      overduePayments,
    };
  }, [filtered]);

  if (sales.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="h-5 w-5" />}
        title="No bookings yet"
        description="When you sell a unit, it appears here as a card flowing through the BBA pipeline: Booked → BBA Signed → Payments → Registry → Completed."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary bar ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total Sales" value={String(stats.total)} tone="default" />
        <StatCard label="BBA Done" value={String(stats.bbaDone)} tone="success" />
        <StatCard label="BBA Pending" value={String(stats.bbaPending)} tone="warning" />
        <StatCard label="Overdue" value={String(stats.overduePayments)} tone={stats.overduePayments > 0 ? "danger" : "default"} />
        <StatCard label="Revenue" value={formatCurrency(stats.totalRevenue)} tone="success" />
        <StatCard label="Collected" value={formatCurrency(stats.totalCollected)} tone="success" />
        <StatCard label="Outstanding" value={formatCurrency(stats.totalOutstanding)} tone={stats.totalOutstanding > 0 ? "warning" : "default"} />
      </div>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-8 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
            style={{ width: 140 }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, unit, sale…"
              className="h-8 w-56 rounded-md border border-input bg-card pl-7 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
            />
          </div>
        </div>

        {onSendReminders && (
          <Button variant="outline" size="sm" onClick={onSendReminders}>
            <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> Send Reminders
          </Button>
        )}
      </div>

      {/* ── Kanban Board ───────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const colTotal = col.items.reduce((s, x) => s + x.salePrice + x.gstAmount, 0);
          const colCollected = col.items.reduce((s, x) => s + x.totalPaid, 0);
          return (
            <div key={col.stage} className="flex w-72 shrink-0 flex-col">
              {/* Column header */}
              <div className="mb-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded" style={{ backgroundColor: `color-mix(in srgb, ${col.color} 15%, transparent)` }}>
                    <col.icon className="h-3 w-3" style={{ color: col.color }} />
                  </span>
                  <span className="text-label font-semibold text-foreground">{col.label}</span>
                  <span className="ml-auto rounded-full bg-foreground/10 px-1.5 py-0.5 text-micro font-semibold tnum text-foreground">
                    {col.items.length}
                  </span>
                </div>
                <p className="mt-0.5 text-micro text-muted-foreground">{col.description}</p>
                {col.items.length > 0 && (
                  <p className="mt-1 text-micro tnum text-muted-foreground">
                    {formatCurrency(colCollected)} / {formatCurrency(colTotal)}
                  </p>
                )}
              </div>

              {/* Column body */}
              <div className="flex-1 space-y-2">
                {col.items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 py-8 text-center text-micro text-muted-foreground/50">
                    empty
                  </div>
                )}
                {col.items.map((sale) => (
                  <BbaSaleCard
                    key={sale.id}
                    sale={sale}
                    stage={col.stage}
                    onClick={() => onSelectSale(sale)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Sale card
// ════════════════════════════════════════════════════════════════

function BbaSaleCard({
  sale,
  stage,
  onClick,
}: {
  sale: AssetSaleRow;
  stage: BbaStage;
  onClick: () => void;
}) {
  const grandTotal = sale.salePrice + sale.gstAmount;
  const paidPct = grandTotal > 0 ? Math.round((sale.totalPaid / grandTotal) * 100) : 0;

  // Find next due installment
  const nextDue = sale.paymentSchedule?.items.find((i) => i.status === "DUE" || i.status === "PARTIAL");
  const hasOverdue = sale.paymentSchedule?.items.some(
    (i) => i.status === "DUE" && i.dueDate && new Date(i.dueDate) < new Date(),
  );

  const assetLabel = sale.builtUnitNumber
    ? `Unit ${sale.builtUnitNumber}`
    : sale.landParcelNumber
      ? `Parcel ${sale.landParcelNumber}`
      : "—";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group block w-full rounded-lg border p-3 text-left transition-all hover:border-foreground/20 hover:shadow-sm",
        hasOverdue ? "border-danger/30 bg-danger-soft/5" : "border-border bg-card",
      )}
    >
      {/* Top: sale number + overdue dot */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-micro font-medium text-muted-foreground">{sale.saleNumber}</span>
        {hasOverdue && (
          <span className="flex items-center gap-1 text-micro font-semibold text-danger">
            <span className="size-1.5 rounded-full bg-danger animate-pulse" /> overdue
          </span>
        )}
      </div>

      {/* Asset + project */}
      <div className="mt-1 flex items-center gap-1.5">
        <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-body font-semibold text-foreground">{assetLabel}</span>
      </div>
      <div className="truncate text-micro text-muted-foreground">{sale.projectName ?? "No project"}</div>

      {/* Customer */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-micro font-semibold text-background">
          {sale.customerName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-caption font-medium text-foreground">{sale.customerName}</div>
          {sale.customerPhone && (
            <div className="flex items-center gap-0.5 text-micro text-muted-foreground">
              <Phone className="h-2.5 w-2.5" /> {sale.customerPhone}
            </div>
          )}
        </div>
      </div>

      {/* Sale price + paid progress */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-caption">
          <span className="tnum font-semibold text-foreground">{formatCurrency(grandTotal)}</span>
          <span className="tnum text-muted-foreground">{paidPct}% paid</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all",
              paidPct === 100 ? "bg-success" : paidPct > 0 ? "bg-brand" : "bg-muted-foreground/20",
            )}
            style={{ width: `${paidPct}%` }}
          />
        </div>
      </div>

      {/* Next due installment */}
      {nextDue && (
        <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-2 py-1">
          <div className="min-w-0">
            <div className="truncate text-micro font-medium text-foreground">{nextDue.description}</div>
            <div className="text-micro text-muted-foreground">
              {formatCurrency(nextDue.amount)}
              {nextDue.dueDate && ` · ${formatDate(nextDue.dueDate)}`}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-micro font-semibold",
              nextDue.status === "DUE" ? "bg-warning/15 text-warning" : "bg-brand/15 text-brand",
            )}
          >
            {nextDue.status === "DUE" ? "DUE" : "PARTIAL"}
          </span>
        </div>
      )}

      {/* Footer: BBA badge + broker */}
      <div className="mt-2 flex items-center gap-1.5">
        {sale.bbaNo ? (
          <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-micro font-medium text-success">
            <FileText className="h-2.5 w-2.5" /> BBA
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-micro font-medium text-warning">
            <FileText className="h-2.5 w-2.5" /> BBA pending
          </span>
        )}
        {sale.dealSource === "BROKER" && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">
            <TrendingUp className="h-2.5 w-2.5" /> {sale.brokerName ?? "Broker"}
          </span>
        )}
        {sale.saleDeedNo && (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-micro font-medium text-success">
            <Scale className="h-2.5 w-2.5" /> Registry
          </span>
        )}
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
//  Stat card
// ════════════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-micro text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-body font-semibold tnum", toneClass)}>{value}</div>
    </div>
  );
}

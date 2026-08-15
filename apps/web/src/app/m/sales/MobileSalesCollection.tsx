"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Wallet, TrendingUp, CheckCircle2,
  IndianRupee, Loader2, Phone, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";

export interface SaleItem {
  id: string;
  saleNumber: string;
  customerName: string;
  customerId: string;
  customerPhone: string | null;
  assetLabel: string;
  saleDate: string;
  salePrice: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  saleStage: string;
}

interface Stats {
  totalValue: number;
  totalCollected: number;
  totalOutstanding: number;
  outstandingCount: number;
  settledCount: number;
  collectionPct: number;
}

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

const STATUS_META: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--color-signal)", label: "Pending" },
  PARTIAL: { color: "var(--color-signal)", label: "Partial" },
  PAID: { color: "var(--color-go)", label: "Paid" },
};

export function MobileSalesCollection({ items, stats }: { items: SaleItem[]; stats: Stats }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"OUTSTANDING" | "SETTLED" | "ALL">("OUTSTANDING");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "OUTSTANDING") result = result.filter((s) => s.balance > 0);
    else if (filter === "SETTLED") result = result.filter((s) => s.balance <= 0);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.customerName.toLowerCase().includes(q) ||
          s.saleNumber.toLowerCase().includes(q) ||
          s.assetLabel.toLowerCase().includes(q),
      );
    }
    // Sort: biggest outstanding first when viewing outstanding, newest first otherwise
    if (filter === "OUTSTANDING") {
      result = [...result].sort((a, b) => b.balance - a.balance);
    }
    return result;
  }, [items, filter, query]);

  const outstanding = filtered.filter((s) => s.balance > 0);
  const settled = filtered.filter((s) => s.balance <= 0);

  const FILTERS: { label: string; value: "OUTSTANDING" | "SETTLED" | "ALL"; count: number }[] = [
    { label: "Outstanding", value: "OUTSTANDING", count: stats.outstandingCount },
    { label: "Settled", value: "SETTLED", count: stats.settledCount },
    { label: "All", value: "ALL", count: items.length },
  ];

  return (
    <div className="pb-6">
      {/* ── Collection banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.5rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Total Outstanding
          </p>
          <span
            className="text-[0.5rem] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
            style={{
              color: stats.collectionPct >= 80 ? "var(--color-go)" : "var(--color-signal)",
              backgroundColor: `color-mix(in srgb, ${stats.collectionPct >= 80 ? "var(--color-go)" : "var(--color-signal)"} 10%, transparent)`,
            }}
          >
            {stats.collectionPct}% collected
          </span>
        </div>
        <p className="text-[1.25rem] font-bold tabular-nums mb-2" style={{ color: "var(--color-ink-950)" }}>
          {formatCurrency(stats.totalOutstanding)}
        </p>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full overflow-hidden mb-2"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${stats.collectionPct}%`,
              backgroundColor: "var(--color-go)",
            }}
          />
        </div>

        {/* Mini stats */}
        <div className="flex items-center gap-3 text-[0.5rem]">
          <span className="flex items-center gap-1" style={{ color: "var(--color-go)" }}>
            <TrendingUp className="size-2.5" />
            {formatCurrencyCompact(stats.totalCollected)} collected
          </span>
          <span style={{ color: "var(--color-ink-500)" }}>
            {stats.outstandingCount} deals due
          </span>
        </div>
      </div>

      {/* ── New sale button ── */}
      <Link
        href="/m/sales/new"
        className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-[0.6875rem] font-bold press mb-3"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        <Plus className="size-3.5" />
        New Sale
      </Link>

      {/* ── Filter chips ── */}
      <div className="flex gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="flex items-center gap-1 h-7 px-2.5 rounded-full text-[0.5rem] font-bold press"
            style={{
              color: filter === f.value ? "var(--color-paper)" : "var(--color-ink-600)",
              backgroundColor: filter === f.value ? "var(--color-ink-950)" : "var(--color-concrete)",
            }}
          >
            {f.label}
            <span className="text-[0.4375rem] tabular-nums" style={{ opacity: 0.6 }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customer, sale no, or asset…"
        className="w-full h-9 rounded-[0.5rem] border px-3 text-[0.6875rem] mb-3 outline-none"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink-950)",
        }}
      />

      {/* ── Outstanding deals ── */}
      {outstanding.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {outstanding.map((sale) => (
            <OutstandingCard
              key={sale.id}
              sale={sale}
              expanded={expandedId === sale.id}
              onToggle={() => setExpandedId(expandedId === sale.id ? null : sale.id)}
              onPaid={() => {
                setExpandedId(null);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {/* ── Settled deals (compact) ── */}
      {settled.length > 0 && (
        <>
          <p
            className="text-[0.5rem] font-bold uppercase tracking-wide mb-2 px-1"
            style={{ color: "var(--color-ink-500)" }}
          >
            Settled ({settled.length})
          </p>
          <div className="flex flex-col gap-1">
            {settled.map((sale) => (
              <SettledRow key={sale.id} sale={sale} />
            ))}
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-[0.625rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Wallet className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            {items.length === 0 ? "No sales yet" : "No matches"}
          </p>
          <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
            {items.length === 0
              ? "Create your first sale to start tracking collections"
              : "Try a different search or filter"}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Outstanding card with inline payment ─── */
function OutstandingCard({
  sale,
  expanded,
  onToggle,
  onPaid,
}: {
  sale: SaleItem;
  expanded: boolean;
  onToggle: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(String(sale.balance));
  const [mode, setMode] = useState<string>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const meta = STATUS_META[sale.paymentStatus] ?? { color: "var(--color-ink-500)", label: sale.paymentStatus };

  async function recordPayment() {
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Enter a valid amount");
    if (amt > sale.balance) return toast.error(`Amount exceeds balance of ${formatCurrency(sale.balance)}`);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, mode, reference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success(
        data.paymentStatus === "PAID"
          ? "Payment recorded — fully paid"
          : `${formatCurrency(sale.balance - amt)} remaining`,
      );
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-[0.5rem] border overflow-hidden"
      style={{
        borderColor: expanded ? "var(--color-signal)" : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Card header */}
      <button
        onClick={onToggle}
        disabled={submitting}
        className="w-full text-left p-2.5 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-[0.75rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {sale.customerName}
          </p>
          <span
            className="text-[0.4375rem] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
          >
            {meta.label}
          </span>
        </div>
        <p className="text-[0.5rem] truncate mb-2" style={{ color: "var(--color-ink-500)" }}>
          {sale.assetLabel} · {sale.saleNumber}
        </p>

        {/* Amount row */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Outstanding
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-signal)" }}>
              {formatCurrency(sale.balance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Collected
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrencyCompact(sale.totalPaid)} / {formatCurrencyCompact(sale.salePrice)}
            </p>
          </div>
        </div>

        {/* Mini progress bar */}
        <div
          className="h-1 rounded-full overflow-hidden mt-2"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${sale.salePrice > 0 ? (sale.totalPaid / sale.salePrice) * 100 : 0}%`,
              backgroundColor: "var(--color-go)",
            }}
          />
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
            {formatDate(sale.saleDate)}
          </span>
          <div className="flex items-center gap-1.5">
            {sale.customerPhone ? (
              <a
                href={`tel:${sale.customerPhone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
                style={{ color: "var(--color-ink-600)" }}
              >
                <Phone className="size-2.5" />
                Call
              </a>
            ) : null}
            <Link
              href={`/m/sales/${sale.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
              style={{ color: "var(--color-ink-600)" }}
            >
              Details
              <ArrowRight className="size-2.5" />
            </Link>
            <Link
              href={`/m/customers/${sale.customerId}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
              style={{ color: "var(--color-ink-600)" }}
            >
              Profile
              <ArrowRight className="size-2.5" />
            </Link>
          </div>
        </div>
      </button>

      {/* Expanded payment form */}
      {expanded && (
        <div
          className="p-2.5 border-t"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <div className="flex items-center justify-between mb-2.5 text-[0.5rem]">
            <span style={{ color: "var(--color-ink-500)" }}>Sale price</span>
            <span className="tabular-nums font-semibold" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(sale.salePrice)}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2.5 text-[0.5rem]">
            <span style={{ color: "var(--color-ink-500)" }}>Paid so far</span>
            <span className="tabular-nums font-semibold" style={{ color: "var(--color-go)" }}>
              {formatCurrency(sale.totalPaid)}
            </span>
          </div>
          <div className="flex items-center justify-between mb-3 text-[0.5625rem] font-bold border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
            <span style={{ color: "var(--color-ink-950)" }}>Balance</span>
            <span className="tabular-nums" style={{ color: "var(--color-signal)" }}>
              {formatCurrency(sale.balance)}
            </span>
          </div>

          {/* Amount input */}
          <div className="mb-2">
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Amount
            </label>
            <div className="relative">
              <IndianRupee
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3"
                style={{ color: "var(--color-ink-400)" }}
              />
              <input
                type="text"
                inputMode="decimal"
                min="0"
                max={sale.balance}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-9 rounded-[0.375rem] border pl-7 pr-2 text-[0.6875rem] tabular-nums outline-none"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                  color: "var(--color-ink-950)",
                }}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Mode selector */}
          <div className="mb-2">
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Mode
            </label>
            <div className="flex flex-wrap gap-1">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="h-6 px-2 rounded-[0.25rem] text-[0.4375rem] font-semibold press"
                  style={{
                    color: mode === m ? "var(--color-paper)" : "var(--color-ink-600)",
                    backgroundColor: mode === m ? "var(--color-ink-950)" : "var(--color-concrete)",
                  }}
                >
                  {m.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Reference */}
          <div className="mb-3">
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Reference (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full h-9 rounded-[0.375rem] border px-2.5 text-[0.6875rem] outline-none"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
              placeholder="Cheque no, UPI ID…"
            />
          </div>

          {/* Submit */}
          <button
            onClick={recordPayment}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-[0.6875rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Settled row (compact, view-only) ─── */
function SettledRow({ sale }: { sale: SaleItem }) {
  return (
    <Link
      href={`/m/sales/${sale.id}`}
      className="flex items-center gap-2 px-2 py-1.5 rounded-[0.375rem] press"
      style={{ backgroundColor: "transparent" }}
    >
      <CheckCircle2 className="size-3 shrink-0" style={{ color: "var(--color-go)" }} />
      <span
        className="text-[0.6875rem] font-medium truncate flex-1"
        style={{ color: "var(--color-ink-900)" }}
      >
        {sale.customerName}
      </span>
      <span
        className="text-[0.5625rem] tabular-nums font-semibold shrink-0"
        style={{ color: "var(--color-go)" }}
      >
        {formatCurrencyCompact(sale.salePrice)}
      </span>
    </Link>
  );
}

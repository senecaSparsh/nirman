"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Wallet,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSearchHeader, MobileFilterChips } from "@/components/mobile/v2/scaffold";
import { MobileStatusBadge, MobileEmptyState, MobileCta } from "@/components/mobile/v2/primitives";

const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "OTHER"] as const;

interface SaleItem {
  id: string;
  saleNumber: string;
  customerName: string;
  saleDate: string;
  salePrice: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  status: string;
}

// ── Component ───────────────────────────────────────────────────

export function MobileSalesList({ sales }: { sales: SaleItem[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "PARTIAL" | "PAID">("ALL");

  const activeSales = sales.filter((s) => s.status !== "CANCELLED");

  // Apply search filter (by customer name or sale number)
  const searched = query.trim()
    ? activeSales.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.customerName.toLowerCase().includes(q) ||
          s.saleNumber.toLowerCase().includes(q)
        );
      })
    : activeSales;

  // Apply status filter chip
  const filtered = filter === "ALL" ? searched : searched.filter((s) => s.paymentStatus === filter);

  const dueSales = filtered.filter((s) => s.paymentStatus === "PENDING" || s.paymentStatus === "PARTIAL");
  const paidSales = filtered.filter((s) => s.paymentStatus === "PAID");

  const FILTER_CHIPS: { label: string; value: "ALL" | "PENDING" | "PARTIAL" | "PAID" }[] = [
    { label: "All", value: "ALL" },
    { label: "Pending", value: "PENDING" },
    { label: "Partial", value: "PARTIAL" },
    { label: "Paid", value: "PAID" },
  ];

  return (
    <div>
      {/* ── Search + filter ────────────────────────────────────── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search customer or sale no…"
        filterChips={<MobileFilterChips chips={FILTER_CHIPS} active={filter} onChange={setFilter} />}
        showClear={!!query || filter !== "ALL"}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />

      {/* ── Payments due (actionable) ──────────────────────────── */}
      {dueSales.length > 0 && (
        <h2 className="px-4 pb-1.5 pt-3 text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
          Payments Due ({dueSales.length})
        </h2>
      )}
      {dueSales.map((sale) => (
        <SaleCard
          key={sale.id}
          sale={sale}
          expanded={expanded === sale.id}
          onToggle={() => setExpanded(expanded === sale.id ? null : sale.id)}
          onPaid={() => {
            setExpanded(null);
            router.refresh();
          }}
        />
      ))}

      {/* ── Fully paid (view-only) ─────────────────────────────── */}
      {paidSales.length > 0 && (
        <h2 className="px-4 pb-1.5 pt-3 text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
          Paid ({paidSales.length})
        </h2>
      )}
      {paidSales.map((sale) => (
        <div
          key={sale.id}
          className="flex min-h-12 items-center gap-3 border-b px-4 py-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.375rem]"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)" }}
          >
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--color-go)" }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{sale.customerName}</div>
            <div className="truncate text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {sale.saleNumber} · {formatDate(sale.saleDate)}
            </div>
          </div>
          <MobileStatusBadge status={sale.paymentStatus} />
          <span className="shrink-0 text-m-caption font-medium tnum" style={{ color: "var(--color-go)" }}>
            {formatCurrency(sale.salePrice)}
          </span>
        </div>
      ))}

      {filtered.length === 0 && (
        activeSales.length === 0 ? (
          <MobileEmptyState
            icon={ShoppingCart}
            title="No sales yet"
            hint="Create your first sale to start tracking bookings and payments."
            action={<MobileCta href="/m/sales/new" icon={ShoppingCart} variant="primary">New Sale</MobileCta>}
          />
        ) : (
          <MobileEmptyState
            icon={ShoppingCart}
            title="No sales match your search"
            hint="Try adjusting your search or filter to find what you're looking for."
          />
        )
      )}
    </div>
  );
}

// ── Sale card with expandable payment form ──────────────────────

function SaleCard({
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

  async function recordPayment() {
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Enter a valid amount");
    if (amt > sale.balance) return toast.error(`Amount exceeds balance of ${formatCurrency(sale.balance)}`);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          mode,
          reference: reference || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success(
        data.paymentStatus === "PAID"
          ? "Payment recorded — fully paid"
          : `Payment recorded — ${formatCurrency(sale.balance - amt)} remaining`,
      );
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        disabled={submitting}
        aria-label="Expand row"
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left press transition-colors"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.375rem]"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-warn) 10%, transparent)" }}
        >
          <Wallet className="h-4 w-4" style={{ color: "var(--color-warn)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{sale.customerName}</div>
          <div className="truncate text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            {sale.saleNumber} · {formatDate(sale.saleDate)}
          </div>
        </div>
        <MobileStatusBadge status={sale.paymentStatus} />
        <div className="shrink-0 text-right">
          <div className="text-m-caption font-medium tnum" style={{ color: "var(--color-warn)" }}>{formatCurrency(sale.balance)}</div>
          <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>due</div>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        )}
      </button>

      {/* Expanded payment form */}
      {expanded && (
        <div className="px-4 pb-4">
          {/* Summary */}
          <div
            className="mb-3 rounded-[0.375rem] border p-3 text-m-caption"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--color-ink-500)" }}>Sale price</span>
              <span className="tnum" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(sale.salePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--color-ink-500)" }}>Paid so far</span>
              <span className="tnum" style={{ color: "var(--color-go)" }}>{formatCurrency(sale.totalPaid)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-semibold" style={{ borderColor: "var(--color-line)" }}>
              <span style={{ color: "var(--color-ink-950)" }}>Balance</span>
              <span className="tnum" style={{ color: "var(--color-warn)" }}>{formatCurrency(sale.balance)}</span>
            </div>
          </div>

          {/* Payment form */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>Amount</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-ink-500)" }} />
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min="0"
                  max={sale.balance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-[0.375rem] border py-2.5 pl-9 pr-3 text-m-body outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1">
              <EnumSelect
                label="Mode"
                value={mode}
                onChange={setMode}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m.replace(/_/g, " ") }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>Reference (optional)</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-[0.375rem] border px-3 py-2.5 text-m-body outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                placeholder="Cheque no, UPI ID, transaction ref…"
              />
            </div>

            <button
              onClick={recordPayment}
              disabled={submitting}
              className="w-full rounded-[0.625rem] py-2.5 text-m-body font-semibold press disabled:opacity-50 active:scale-95 transition-transform"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Recording…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4" /> Record Payment
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

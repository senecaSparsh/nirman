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
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Input, Select, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MobileSearchBar, MobileFilterChips, MobileStatusBadge } from "@/components/mobile/mobile-primitives";

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
      <MobileSearchBar value={query} onChange={setQuery} placeholder="Search customer or sale no…" />
      <MobileFilterChips chips={FILTER_CHIPS} active={filter} onChange={setFilter} />

      {/* ── Payments due (actionable) ──────────────────────────── */}
      {dueSales.length > 0 && (
        <h2 className="px-4 pb-1.5 pt-3 text-label text-muted-foreground/75">
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
        <h2 className="px-4 pb-1.5 pt-5 text-label text-muted-foreground/75">
          Paid ({paidSales.length})
        </h2>
      )}
      {paidSales.map((sale) => (
        <div
          key={sale.id}
          className="flex min-h-12 items-center gap-3 border-b border-border/70 bg-card px-4 py-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-semibold text-foreground">{sale.customerName}</div>
            <div className="truncate text-caption text-muted-foreground">
              {sale.saleNumber} · {formatDate(sale.saleDate)}
            </div>
          </div>
          <MobileStatusBadge status={sale.paymentStatus} />
          <span className="shrink-0 text-meta font-medium tnum text-success">
            {formatCurrency(sale.salePrice)}
          </span>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <ShoppingCart className="mb-3 h-10 w-10 text-muted-foreground/55" />
          <p className="text-body font-semibold text-foreground">
            {activeSales.length === 0 ? "No sales yet" : "No sales match your search"}
          </p>
        </div>
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
    <div className="border-b border-border/70 bg-card">
      {/* Header row */}
      <button
        onClick={onToggle}
        disabled={submitting}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-accent"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Wallet className="h-4 w-4 text-warning" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-foreground">{sale.customerName}</div>
          <div className="truncate text-caption text-muted-foreground">
            {sale.saleNumber} · {formatDate(sale.saleDate)}
          </div>
        </div>
        <MobileStatusBadge status={sale.paymentStatus} />
        <div className="shrink-0 text-right">
          <div className="text-meta font-medium tnum text-warning">{formatCurrency(sale.balance)}</div>
          <div className="text-caption text-muted-foreground">due</div>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        )}
      </button>

      {/* Expanded payment form */}
      {expanded && (
        <div className="px-4 pb-4">
          {/* Summary */}
          <div className="mb-3 rounded-md border border-border bg-background p-3 text-meta">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sale price</span>
              <span className="tnum text-foreground">{formatCurrency(sale.salePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid so far</span>
              <span className="tnum text-success">{formatCurrency(sale.totalPaid)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Balance</span>
              <span className="tnum text-warning">{formatCurrency(sale.balance)}</span>
            </div>
          </div>

          {/* Payment form */}
          <div className="space-y-3">
            <div>
              <Label>Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min="0"
                  max={sale.balance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-9"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque no, UPI ID, transaction ref…"
              />
            </div>

            <Button
              onClick={recordPayment}
              disabled={submitting}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {submitting ? "Recording…" : "Record Payment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

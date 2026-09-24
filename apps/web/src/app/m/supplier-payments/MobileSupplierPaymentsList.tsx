"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Share2, Hash, Calendar, Building2, IndianRupee, CreditCard, FileText, Eye, Ban } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate, formatEnumLabel } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";

export type SupplierPaymentListItem = {
  id: string;
  paymentNumber: string;
  supplierName: string;
  supplierId: string;
  poId: string | null;
  poNumber: string | null;
  invoiceNumber: string | null;
  amount: number;
  paymentDate: string;
  paymentMode: string | null;
  status?: string;
};

export function MobileSupplierPaymentsList({
  items: initialItems,
  totalAmount,
  canManage,
  canViewProcurement,
  loadMoreUrl,
  initialCursor,
  filterSupplierId,
}: {
  items: SupplierPaymentListItem[];
  totalAmount: number;
  canManage?: boolean;
  canViewProcurement?: boolean;
  loadMoreUrl?: string;
  initialCursor?: string | null;
  /** Deep-link supplier filter (?supplierId=) — e.g. "payments to X" from the assistant. */
  filterSupplierId?: string | null;
}) {
  const [query, setQuery] = useState("");

  const { items, hasMore, loading, loadMore } = usePaginatedList<SupplierPaymentListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    if (filterSupplierId) {
      result = result.filter((p) => p.supplierId === filterSupplierId);
    }
    if (!query.trim()) return result;
    const q = query.toLowerCase();
    return result.filter(
      (p) =>
        p.paymentNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.poNumber?.toLowerCase().includes(q) ?? false) ||
        (p.invoiceNumber?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query, filterSupplierId]);

  const stats: SummaryStat[] = [
    { label: "Total Paid", value: formatCurrencyCompact(totalAmount) },
    { label: "Payments", value: String(items.length) },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Banknote}
        title="No supplier payments"
        hint={canManage ? "Record payments from the Accounts → Payments tab" : "Payments made to suppliers will appear here once recorded."}
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search payments…"
      />
      <MobileSummaryStrip stats={stats} />
      <div className="flex flex-col gap-2.5 px-1">
        {filtered.map((p) => (
          <SupplierPaymentCard key={p.id} p={p} canManage={canManage} canViewProcurement={canViewProcurement} />
        ))}
      </div>
      {filtered.length === 0 && <MobileNoResults query={query} />}
      {loadMoreUrl ? (
        <MobileLoadMore
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          count={items.length}
        />
      ) : null}
    </div>
  );
}

/* ─── Supplier payment card — long-press opens overview sheet ─── */
function SupplierPaymentCard({ p, canManage, canViewProcurement }: { p: SupplierPaymentListItem; canManage?: boolean; canViewProcurement?: boolean }) {
  const router = useRouter();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  async function submitVoid() {
    setVoiding(true);
    try {
      const res = await fetch(`/api/supplier-payments/${p.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to void payment");
      }
      toast.success("Payment voided — books reversed");
      setVoidOpen(false);
      setOverviewOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void payment");
    } finally {
      setVoiding(false);
    }
  }

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const overviewRows: OverviewRow[] = [
    { icon: Hash, label: "Payment No", value: p.paymentNumber, mono: true },
    { icon: Calendar, label: "Date", value: formatDate(p.paymentDate) },
    { icon: Building2, label: "Supplier", value: p.supplierName },
    { icon: IndianRupee, label: "Amount", value: formatCurrency(p.amount), valueColor: "var(--color-stop)" },
    { icon: CreditCard, label: "Mode", value: p.paymentMode ?? "—" },
    { icon: FileText, label: "Reference", value: p.poNumber ?? p.invoiceNumber ?? "—" },
  ];

  const overviewActions: ContextAction[] = [
    ...(p.poId && canViewProcurement
      ? [{
          label: "View PO",
          icon: Eye,
          onPress: () => router.push(`/m/procurement/${p.poId}`),
        }]
      : []),
    ...(canViewProcurement
      ? [{
          label: "View Supplier",
          icon: Building2,
          onPress: () => router.push(`/m/suppliers/${p.supplierId}`),
        }]
      : []),
    ...(canManage && p.status !== "VOID"
      ? [{
          label: "Void payment",
          icon: Ban,
          destructive: true,
          onPress: () => { setOverviewOpen(false); setVoidOpen(true); },
        }]
      : []),
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/supplier-payments`;
        if (navigator.share) {
          navigator.share({ title: p.paymentNumber, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <>
      <div {...longPressBind}>
        <button
          type="button"
          onClick={() => { setPressPoint(null); setOverviewOpen(true); }}
          className="block w-full text-left rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors active:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-caption text-muted-foreground">{p.paymentNumber}</span>
              <p className="mt-0.5 truncate text-body font-medium text-foreground">{p.supplierName}</p>
              {p.poNumber && (
                <p className="mt-0.5 truncate text-caption text-muted-foreground">PO: {p.poNumber}</p>
              )}
            </div>
            <div className="text-right">
              <p className="tnum text-body font-semibold text-foreground">{formatCurrencyCompact(p.amount)}</p>
              {p.status === "VOID" && (
                <span className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-caption font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)", color: "var(--color-stop)" }}>
                  Void
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-caption text-muted-foreground">
              {p.paymentMode ? formatEnumLabel(p.paymentMode) : "—"}
            </span>
            <span className="text-caption text-muted-foreground">{formatDate(p.paymentDate)}</span>
          </div>
        </button>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={p.paymentNumber}
        subtitle={p.supplierName}
        rows={overviewRows}
        actions={overviewActions}
      />

      {/* Void confirm */}
      {voidOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => !voiding && setVoidOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-card p-4 pb-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-section font-bold text-foreground">Void {p.paymentNumber}?</h3>
            <p className="mt-1 text-caption text-muted-foreground">
              The payment is marked void and its accounting entry reversed — the supplier&apos;s balance re-opens and any invoice it paid goes back to unpaid. The record stays for audit.
            </p>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason (optional) — e.g. wrong amount keyed"
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-body outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                disabled={voiding}
                className="flex-1 rounded-lg border border-border py-2.5 text-label font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitVoid}
                disabled={voiding}
                className="flex-1 rounded-lg py-2.5 text-label font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)" }}
              >
                {voiding ? "Voiding…" : "Void payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

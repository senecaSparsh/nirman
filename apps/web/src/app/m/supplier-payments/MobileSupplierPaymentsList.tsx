"use client";

import { useState, useMemo } from "react";
import { Banknote, Share2, Hash, Calendar, Building2, IndianRupee, CreditCard, FileText } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileCardGrid,
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
  poNumber: string | null;
  invoiceNumber: string | null;
  amount: number;
  paymentDate: string;
  paymentMode: string | null;
};

export function MobileSupplierPaymentsList({
  items: initialItems,
  totalAmount,
  canManage,
  loadMoreUrl,
  initialCursor,
}: {
  items: SupplierPaymentListItem[];
  totalAmount: number;
  canManage?: boolean;
  loadMoreUrl?: string;
  initialCursor?: string | null;
}) {
  const [query, setQuery] = useState("");

  const { items, hasMore, loading, loadMore } = usePaginatedList<SupplierPaymentListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (p) =>
        p.paymentNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.poNumber?.toLowerCase().includes(q) ?? false) ||
        (p.invoiceNumber?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const stats: SummaryStat[] = [
    { label: "Total Paid", value: formatCurrencyCompact(totalAmount) },
    { label: "Payments", value: String(items.length) },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Banknote}
        title="No supplier payments"
        hint={canManage ? "Tap + to record your first payment" : "Payments made to suppliers will appear here once recorded."}
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
      <MobileCardGrid>
        {filtered.map((p) => (
          <SupplierPaymentCard key={p.id} p={p} />
        ))}
      </MobileCardGrid>
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
function SupplierPaymentCard({ p }: { p: SupplierPaymentListItem }) {
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
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-caption text-muted-foreground">
              {p.paymentMode ?? "—"}
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
    </>
  );
}

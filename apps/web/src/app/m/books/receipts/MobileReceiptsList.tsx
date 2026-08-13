"use client";

import { useState, useMemo } from "react";
import { Wallet, Search, X, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileSectionTitle, MobileRow, MobileEmptyState } from "@/components/mobile/v2/primitives";

export type ReceiptListItem = {
  id: string;
  kind: "ASSET" | "MATERIAL";
  customerName: string;
  saleNumber: string;
  mode: string;
  amount: number;
  paymentDate: string;
};

/**
 * Client component for the mobile receipts list. Handles client-side
 * search by customer name or payment mode. Rows link to the receipt
 * detail page (/m/books/receipts/[id]?kind=…).
 */
export function MobileReceiptsList({ items }: { items: ReceiptListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.mode.toLowerCase().includes(q) ||
        r.saleNumber.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, mode, sale no..."
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }} />
          {query && <button onClick={() => setQuery("")} className="press"><X className="size-4" style={{ color: "var(--color-ink-300)" }} /></button>}
        </div>
      </div>

      <MobileSectionTitle>Recent Payments ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No matching receipts" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <MobileRow
              key={`${r.kind}-${r.id}`}
              href={`/m/books/receipts/${r.id}?kind=${r.kind}`}
              icon={r.kind === "MATERIAL" ? Printer : Wallet}
              title={r.customerName}
              subtitle={`${formatDate(r.paymentDate)} · ${r.mode} · ${r.saleNumber}`}
              meta={formatCurrency(r.amount)}
              metaSub={r.kind === "MATERIAL" ? "Material Sale" : "Property Sale"}
              tone="success"
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Wallet, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileSectionTitle, MobileRow } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
export function MobileReceiptsList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: ReceiptListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
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
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search customer, mode, sale no..."
        action={
          <div className="flex items-center gap-1 shrink-0">
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      <MobileSectionTitle>Recent Payments ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching receipts" hint="Try a different search" />
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

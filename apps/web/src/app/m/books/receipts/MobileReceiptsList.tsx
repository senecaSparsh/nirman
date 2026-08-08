"use client";

import { useState, useMemo } from "react";
import { Wallet } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

export type ReceiptListItem = {
  id: string;
  customerName: string;
  saleNumber: string;
  mode: string;
  amount: number;
  paymentDate: string;
};

/**
 * Client component for the mobile receipts list. Handles client-side
 * search by customer name or payment mode.
 */
export function MobileReceiptsList({ items }: { items: ReceiptListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.mode.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search customer, payment mode…"
      />

      <MobileSectionTitle>Recent Payments ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No matching receipts" hint="Try a different search" />
      ) : (
        <div>
          {filtered.map((r) => (
            <MobileInfoRow
              key={r.id}
              icon={Wallet}
              title={r.customerName}
              subtitle={`${formatDate(r.paymentDate)} · ${r.mode} · ${r.saleNumber}`}
              value={formatCurrency(r.amount)}
              tone="success"
            />
          ))}
        </div>
      )}
    </div>
  );
}

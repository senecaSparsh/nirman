"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileStatusBadge } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";

export type RateContractListItem = {
  id: string;
  supplierName: string;
  materialName: string;
  materialUnit: string;
  agreedRate: number;
  validFrom: string;
  validTo: string;
  minQty: number | null;
  maxQty: number | null;
  notes: string | null;
  isExpired: boolean;
  isActive: boolean;
};

export function MobileRateContractsList({ items }: { items: RateContractListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (c) =>
        c.supplierName.toLowerCase().includes(q) ||
        c.materialName.toLowerCase().includes(q),
    );
  }, [items, query]);

  if (items.length === 0) return null;

  return (
    <div>
      {/* Search */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search supplier or material…"
        showClear={query !== ""}
        onClear={() => setQuery("")}
      />

      {filtered.length === 0 ? (
        <MobileNoResults title="No matching contracts" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <ContractCard key={c.id} contract={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContractCard({ contract: c }: { contract: RateContractListItem }) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{
        borderColor: c.isExpired ? "var(--color-line)" : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        opacity: c.isExpired ? 0.6 : 1,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.75rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {c.supplierName}
        </p>
        <MobileStatusBadge status={c.isActive ? "ACTIVE" : c.isExpired ? "CANCELLED" : "PENDING"} />
      </div>
      <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {c.materialName}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Rate</p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(c.agreedRate)}/{c.materialUnit}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Valid</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(c.validFrom)} → {formatDate(c.validTo)}
          </p>
        </div>
      </div>
      {(c.minQty || c.maxQty) && (
        <p className="text-[0.4375rem] mt-1.5" style={{ color: "var(--color-ink-500)" }}>
          {c.minQty ? `Min: ${c.minQty} ${c.materialUnit}` : ""}
          {c.minQty && c.maxQty ? " · " : ""}
          {c.maxQty ? `Max: ${c.maxQty} ${c.materialUnit}` : ""}
        </p>
      )}
    </div>
  );
}

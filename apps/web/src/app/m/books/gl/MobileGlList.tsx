"use client";

import { useState, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { MobileSectionTitle, MobileRow } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";

export type GlListItem = {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
};

/**
 * Client component for the mobile trial balance list. Handles
 * client-side search by account code or account name.
 */
export function MobileGlList({ items }: { items: GlListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search..."
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      <MobileSectionTitle>Accounts ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching accounts" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <MobileRow
              key={r.code}
              icon={BookOpen}
              title={`${r.code} · ${r.name}`}
              subtitle={r.type}
              meta={r.balance >= 0 ? `Dr ${formatCurrency(r.balance)}` : `Cr ${formatCurrency(-r.balance)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

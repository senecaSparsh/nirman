"use client";

import { useState, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

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
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search account code or name…"
      />

      <MobileSectionTitle>Accounts ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={BookOpen} title="No matching accounts" hint="Try a different search" />
      ) : (
        <div>
          {filtered.map((r) => (
            <MobileInfoRow
              key={r.code}
              icon={BookOpen}
              title={`${r.code} · ${r.name}`}
              subtitle={r.type}
              value={r.balance >= 0 ? `Dr ${formatCurrency(r.balance)}` : `Cr ${formatCurrency(-r.balance)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

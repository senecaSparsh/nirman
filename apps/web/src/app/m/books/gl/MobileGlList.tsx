"use client";

import { useState, useMemo } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { MobileSectionTitle, MobileRow, MobileEmptyState } from "@/components/mobile/v2/primitives";

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
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }} />
          {query && <button onClick={() => setQuery("")} className="press"><X className="size-4" style={{ color: "var(--color-ink-300)" }} /></button>}
        </div>
      </div>

      <MobileSectionTitle>Accounts ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={BookOpen} title="No matching accounts" hint="Try a different search" />
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

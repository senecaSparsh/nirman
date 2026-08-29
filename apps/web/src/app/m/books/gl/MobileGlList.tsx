"use client";

import { useState, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";
import { MobileSectionTitle, MobileRow } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
export function MobileGlList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: GlListItem[];
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
              meta={r.balance >= 0 ? `Dr ${formatCurrencyCompact(r.balance)}` : `Cr ${formatCurrencyCompact(-r.balance)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Recycle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

export type ScrapGenerationItem = {
  id: string;
  scrapNumber: string;
  generationDate: string;
  notes: string | null;
  toLocationName: string;
  projectName: string | null;
  lineCount: number;
  totalValue: number;
  materials: string[];
  moreCount: number;
};

/**
 * Client component for the scrap generations list. Handles
 * client-side search filtering by scrap number, location, project,
 * or material name.
 */
export function MobileScrapGenerationsList({ items }: { items: ScrapGenerationItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((sc) =>
      sc.scrapNumber.toLowerCase().includes(q) ||
      sc.toLocationName.toLowerCase().includes(q) ||
      (sc.projectName?.toLowerCase().includes(q) ?? false) ||
      sc.materials.some((m) => m.toLowerCase().includes(q)),
    );
  }, [items, query]);

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by slip no, location, material…"
      />

      <MobileSectionTitle>
        {query ? `Results (${filtered.length})` : "Recent Scrap"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={Recycle}
          title="No matching scrap slips"
          hint="Try a different search term"
        />
      ) : (
        <div>
          {filtered.map((sc) => {
            const materials = sc.materials.join(", ");
            return (
              <MobileRow
                key={sc.id}
                href={`/m/scrap-generations/${sc.id}`}
                icon={Recycle}
                title={sc.scrapNumber}
                subtitle={`${sc.toLocationName} · ${formatDate(new Date(sc.generationDate))}${sc.projectName ? ` · ${sc.projectName}` : ""}`}
                meta={formatCurrency(sc.totalValue)}
                badge={sc.lineCount > 0 ? `${sc.lineCount} items` : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

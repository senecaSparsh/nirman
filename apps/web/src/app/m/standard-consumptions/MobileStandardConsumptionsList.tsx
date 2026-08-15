"use client";

import { useState, useMemo } from "react";
import { Beaker, Search, X } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

export type StandardConsumptionListItem = {
  id: string;
  workType: string;
  materialName: string;
  materialUnit: string;
  standardQty: number;
  baseQty: number;
  unitOfMeasure: string;
  notes: string | null;
};

export function MobileStandardConsumptionsList({ items }: { items: StandardConsumptionListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (b) =>
        b.workType.toLowerCase().includes(q) ||
        b.materialName.toLowerCase().includes(q),
    );
  }, [items, query]);

  if (items.length === 0) return null;

  // Group by work type
  const workTypes = [...new Set(filtered.map((b) => b.workType))].sort();

  return (
    <div>
      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work type or material…"
            className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press">
              <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <MobileEmptyState icon={Beaker} title="No matching benchmarks" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-3">
          {workTypes.map((wt) => {
            const items_wt = filtered.filter((b) => b.workType === wt);
            return (
              <div key={wt}>
                <div
                  className="pb-1 pt-1 text-[0.5625rem] font-bold uppercase tracking-wide"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {wt} ({items_wt.length})
                </div>
                <div className="flex flex-col gap-1.5">
                  {items_wt.map((b) => (
                    <BenchmarkCard key={b.id} benchmark={b} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BenchmarkCard({ benchmark: b }: { benchmark: StandardConsumptionListItem }) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <p className="text-[0.75rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
        {b.materialName}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Standard</p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(b.standardQty, 3)} {b.materialUnit}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Per</p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(b.baseQty, 2)} {b.unitOfMeasure}
          </p>
        </div>
      </div>
      {b.notes && (
        <p className="text-[0.5rem] mt-1.5" style={{ color: "var(--color-ink-500)" }}>{b.notes}</p>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Ruler } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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

export function MobileStandardConsumptionsList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: StandardConsumptionListItem[];
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
      (b) =>
        b.workType.toLowerCase().includes(q) ||
        b.materialName.toLowerCase().includes(q),
    );
  }, [items, query]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Ruler}
        title="No standard consumptions"
        hint="Consumption benchmarks will appear here"
      />
    );
  }

  // Group by work type
  const workTypes = [...new Set(filtered.map((b) => b.workType))].sort();

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search work type or material…"
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

      {filtered.length === 0 ? (
        <MobileNoResults title="No matching benchmarks" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-3">
          {workTypes.map((wt, idx) => {
            const items_wt = filtered.filter((b) => b.workType === wt);
            return (
              <div key={wt}>
                <div
                  className="pb-1 pt-1 text-m-caption font-bold uppercase tracking-wide flex items-center gap-1.5"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {wt} ({items_wt.length})
                  {idx === 0 && query && (
                    <span
                      className="ml-auto text-m-label font-semibold"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      {filtered.length} benchmark{filtered.length !== 1 ? "s" : ""}
                    </span>
                  )}
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
    <Link
      href={`/m/standard-consumptions/${b.id}`}
      className="rounded-[0.5rem] border p-2.5 text-m-body press block"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <p className="text-m-section font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
        {b.materialName}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Standard</p>
          <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(b.standardQty, 3)} {b.materialUnit}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Per</p>
          <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(b.baseQty, 2)} {b.unitOfMeasure}
          </p>
        </div>
      </div>
      {b.notes && (
        <p className="text-m-caption mt-1.5" style={{ color: "var(--color-ink-500)" }}>{b.notes}</p>
      )}
    </Link>
  );
}

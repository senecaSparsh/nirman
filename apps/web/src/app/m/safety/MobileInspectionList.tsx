"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ClipboardCheck, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";
import type { InspectionListItem } from "./MobileSafetyContent";

type Filter = "ALL" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

const FILTER_CHIPS: { label: string; value: Filter }[] = [
  { label: "All", value: "ALL" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
];

const RESULT_TONES: Record<string, string> = {
  PASSED: "var(--color-go)", PASSED_WITH_NOTES: "var(--color-signal)",
  FAILED: "var(--color-stop)", STOP_WORK: "var(--color-stop)",
};

export function MobileInspectionList({ items }: { items: InspectionListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "ALL") r = r.filter((i) => i.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((i) => i.title.toLowerCase().includes(q) || i.inspectionNumber.toLowerCase().includes(q) || i.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [items, query, filter]);

  if (items.length === 0) {
    return <MobileEmptyState icon={ClipboardCheck} title="No inspections scheduled" hint="Plan safety walkthroughs and inspections here" />;
  }

  return (
    <div>
      <div className="mb-3 relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search inspections…" className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none" style={{ borderColor: query ? "var(--color-ink-950)" : "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
        {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press"><X className="size-3.5" style={{ color: "var(--color-ink-500)" }} /></button>}
      </div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_CHIPS.map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value)} className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap" style={{ backgroundColor: filter === c.value ? "var(--color-ink-950)" : "var(--color-concrete)", color: filter === c.value ? "#fff" : "var(--color-ink-500)" }}>{c.label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={ClipboardCheck} title="No matching inspections" hint="Try a different filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((i) => (
            <Link key={i.id} href={`/m/safety/inspections/${i.id}`} className="rounded-[0.5rem] border p-2.5 block press" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{i.inspectionNumber}</p>
                <MobileStatusBadge status={i.status} />
              </div>
              <p className="text-[0.75rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{i.title}</p>
              <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>{i.projectName}{i.inspectorName ? ` · ${i.inspectorName}` : ""}</p>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Scheduled</p>
                  <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatDate(i.scheduledDate)}</p>
                </div>
                {i.result && (
                  <>
                    <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                    <div>
                      <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Result</p>
                      <p className="text-[0.625rem] font-bold" style={{ color: RESULT_TONES[i.result] ?? "var(--color-ink-500)" }}>{i.result.replace(/_/g, " ")}</p>
                    </div>
                  </>
                )}
                {i.conductedDate && (
                  <div className="ml-auto text-right">
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Conducted</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatDate(i.conductedDate)}</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

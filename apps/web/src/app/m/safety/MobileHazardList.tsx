"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ShieldAlert, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";
import type { HazardListItem } from "./MobileSafetyContent";

type Filter = "ALL" | "IDENTIFIED" | "MITIGATING" | "RESOLVED";

const FILTER_CHIPS: { label: string; value: Filter }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "IDENTIFIED" },
  { label: "Mitigating", value: "MITIGATING" },
  { label: "Resolved", value: "RESOLVED" },
];

const RISK_COLORS: Record<string, string> = {
  LOW: "var(--color-go)", MEDIUM: "var(--color-signal)",
  HIGH: "var(--color-stop)", CRITICAL: "var(--color-stop)",
};

const RISK_BG: Record<string, string> = {
  LOW: "rgba(22,163,74,0.1)", MEDIUM: "rgba(224,154,16,0.1)",
  HIGH: "rgba(220,38,38,0.1)", CRITICAL: "rgba(220,38,38,0.15)",
};

export function MobileHazardList({ items }: { items: HazardListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "ALL") r = r.filter((h) => h.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((h) => h.title.toLowerCase().includes(q) || h.hazardNumber.toLowerCase().includes(q) || h.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [items, query, filter]);

  if (items.length === 0) {
    return <MobileEmptyState icon={ShieldAlert} title="No hazards identified" hint="Report site hazards with risk assessment here" />;
  }

  return (
    <div>
      <div className="mb-3 relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hazards…" className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none" style={{ borderColor: query ? "var(--color-ink-950)" : "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
        {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press"><X className="size-3.5" style={{ color: "var(--color-ink-500)" }} /></button>}
      </div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_CHIPS.map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value)} className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap" style={{ backgroundColor: filter === c.value ? "var(--color-ink-950)" : "var(--color-concrete)", color: filter === c.value ? "#fff" : "var(--color-ink-500)" }}>{c.label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={ShieldAlert} title="No matching hazards" hint="Try a different filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((h) => (
            <Link key={h.id} href={`/m/safety/hazards/${h.id}`} className="rounded-[0.5rem] border p-2.5 block press" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{h.hazardNumber}</p>
                <MobileStatusBadge status={h.status} />
              </div>
              <p className="text-[0.75rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{h.title}</p>
              <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>{h.projectName}{h.location ? ` · ${h.location}` : ""}</p>
              <div className="flex items-center gap-2">
                <div className="rounded-[0.25rem] px-2 py-0.5" style={{ backgroundColor: RISK_BG[h.riskLevel] ?? "var(--color-concrete)" }}>
                  <span className="text-[0.5rem] font-bold uppercase" style={{ color: RISK_COLORS[h.riskLevel] ?? "var(--color-ink-500)" }}>{h.riskLevel}</span>
                </div>
                <span className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>L:{h.likelihood}×S:{h.severity}={h.likelihood * h.severity}</span>
                {h.targetResolutionDate && (
                  <div className="ml-auto text-right">
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Target</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatDate(h.targetResolutionDate)}</p>
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
